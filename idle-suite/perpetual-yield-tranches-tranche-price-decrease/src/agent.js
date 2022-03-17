const { Finding, FindingSeverity, FindingType, ethers } = require("forta-agent")
const { getCdos, getTranchePrices } = require("./helper")

let cdos
let getPrices
function provideInitialize(getCdos, getTranchePrices) {
  return async function initialize() {
    cdos = await getCdos()
    getPrices = getTranchePrices
  }
}

const handleBlock = async (blockEvent) => {
  const findings = []

  // 5 per minute * 10 minutes
  if (blockEvent.blockNumber % 50 != 0) return findings
  
  const tokenPrices = await getPrices(cdos)

  cdos.forEach( (cdo, i) => {
    const oldPriceAA = cdo["AATrancheToken"].oldPrice
    const oldPriceBB = cdo["BBTrancheToken"].oldPrice

    // The even elements are AA tranchePrice
    // The odd elemets are BB tranchePrice
    const currentPriceAA = tokenPrices[2*i]
    const currentPriceBB = tokenPrices[2*i + 1]

    if (currentPriceAA.lt(oldPriceAA)) {
      findings.push(createAlert(cdo.tokenSymbol, currentPriceAA, oldPriceAA, cdo.tokenDecimals, "AA"))
    }
    if (currentPriceBB.lt(oldPriceBB)) {
      findings.push(createAlert(cdo.tokenSymbol, currentPriceBB, oldPriceBB, cdo.tokenDecimals, "BB"))
    }

    cdo["AATrancheToken"].oldPrice = currentPriceAA
    cdo["BBTrancheToken"].oldPrice = currentPriceBB
  })

  return findings
}

function createAlert(symbol, price, oldPrice, decimals, trancheType) {
  return Finding.fromObject({
    name: "Perpetual Yield Tranches Tranche Price Decrease",
    description: `The ${trancheType} tranche price of the ${symbol} CDO has decreased`,
    alertId: "IDLE-PERPETUAL-YIELD-TRANCHES-TRANCHE-PRICE-DECREASE",
    protocol: "idlefi",
    severity: FindingSeverity.Medium,
    type: FindingType.Info,
    metadata: {
      price: ethers.utils.formatUnits(price, decimals),
      oldPrice: ethers.utils.formatUnits(oldPrice, decimals),
      trancheType
    }
  })
}

module.exports = {
  initialize: provideInitialize(getCdos, getTranchePrices),
  provideInitialize,
  handleBlock,
}
