const { getEthersProvider } = require("forta-agent")
const axios = require("axios")
const { Contract, Provider } = require('ethers-multicall')

const ethcallProvider = new Provider(getEthersProvider(), 1)

const theGraphApiUrl = "https://api.thegraph.com/subgraphs/name/samster91/idle-tranches"
const payload = {
  query: `{
        cdos {
          id
          strategy
          strategyToken
        }
      }`
}

const strategyAbi = [
  "function price() external view returns (uint256)"
]

const tokenAbi = [
  "function symbol() external view returns (string memory)",
  "function decimals() external view returns (uint8)"
]
const excludedCDOs = [
  '0xf5a3d259bfe7288284bd41823ec5c8327a314054',
  '0xf615a552c000B114DdAa09636BBF4205De49333c',
  '0x46c1f702a6aad1fd810216a5ff15aab1c62ca826',
  '0xD5469DF8CA36E7EaeDB35D428F28E13380eC8ede',
  '0x860B1d25903DbDFFEC579d30012dA268aEB0d621',
  '0xec964d06cD71a68531fC9D083a142C48441F391C',
  '0x2398Bc075fa62Ee88d7fAb6A18Cd30bFf869bDa4',
].map(c => c.toLowerCase());

// Get the price for all strategies
async function getStrategyPrices(strategies) {
  const priceCalls = strategies.map(strategy => {
    return strategy.contract.price()
  })
  return ethcallProvider.all(priceCalls)
}

module.exports = {
  getStrategies: async () => {
    // Get all CDOs from the subgraph
    const response = await axios.post(theGraphApiUrl, JSON.stringify(payload))
    const cdos = response.data.data.cdos
    cdos = cdos.filter(cdo => !excludedCDOs.includes(cdo.id.toLowerCase()));
    
    // Push all CDO strategies to an array
    const strategies = []
    cdos.forEach(cdo => strategies.push({ address: cdo.strategy }))
    
    const strategyContracts = strategies
    .map(strategy => new Contract(strategy.address, strategyAbi))
    
    const tokenContracts = cdos.map(cdo => new Contract(cdo.strategyToken, tokenAbi))

    // Get The symbol of the strategyToken
    const symbolCalls = tokenContracts.map(contract => contract.symbol())
    const symbols = await ethcallProvider.all(symbolCalls)

    // Get the decimals of the strategyToken
    const decimalsCalls = tokenContracts.map(contract => contract.decimals())
    const decimals = await ethcallProvider.all(decimalsCalls)

    strategies.forEach((strategy, i) => {
      strategy.contract = strategyContracts[i]
      strategy.tokenSymbol = symbols[i]
      strategy.tokenDecimals = decimals[i]
    })

    const prices = await getStrategyPrices(strategies)

    strategies.forEach((strategy, i) => {
      strategy.oldPrice = prices[i]
    })

    return strategies
  },
  getStrategyPrices,
}
