const { getEthersProvider, ethers } = require("forta-agent")
const axios = require("axios")
const { Contract, Provider } = require('ethers-multicall')

const controllerAddress = "0x275DA8e61ea8E02d51EDd8d0DC5c0E62b4CDB0BE"
const controllerAbi = [ "function oracle() public view returns (address oracle)" ]

const contract = new ethers.Contract(controllerAddress, controllerAbi, getEthersProvider())
const ethcallProvider = new Provider(getEthersProvider(), 1)

const theGraphApiUrl = "https://api.thegraph.com/subgraphs/name/samster91/idle-tranches"
const payload = {
  query: `{
        cdos {
          id
          strategyToken
          underlyingToken
        }
      }`
}

const cdoAbi = [ "function getContractValue() external view returns (uint256)" ]

const strategyTokenAbi = [ "function symbol() external view returns (string memory)" ]

const tokenAbi = [ "function decimals() external view returns (uint8)" ]

let oracle
const oracleAbi = [ "function getPriceUSD(address asset) public view returns (int256)" ]

const wethAddress = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2"
const daiAddress = "0x6b175474e89094c44da98b954eedeac495271d0f"

const excludedCDOs = [
  '0xf5a3d259bfe7288284bd41823ec5c8327a314054',
  '0xf615a552c000B114DdAa09636BBF4205De49333c',
  '0x46c1f702a6aad1fd810216a5ff15aab1c62ca826',
  '0xD5469DF8CA36E7EaeDB35D428F28E13380eC8ede',
  '0x860B1d25903DbDFFEC579d30012dA268aEB0d621',
  '0xec964d06cD71a68531fC9D083a142C48441F391C',
  '0x2398Bc075fa62Ee88d7fAb6A18Cd30bFf869bDa4',
].map(c => c.toLowerCase());

// For each CDO get the contractValue and the price of the underlying token
async function getContractValuesInUsd(cdos) {

  const contractValueCalls = cdos.map(cdo => {
    let underlyingToken

    if (cdo.tokenSymbol === "wstETH" || cdo.tokenSymbol === "idleCvxsteCRV") {
      // If the underlying token is stETH (from Lido protocol) or steCRV (from Convex protocol)
      // treat it as WETH
      underlyingToken = wethAddress
    }
    else if (cdo.tokenSymbol.includes("Cvx") || cdo.tokenSymbol === "idleMSmUSD") {
      // If the underlying token is stablecoin Convex token
      // or idle token not supported by the oracle
      // trear it as DAI
      underlyingToken = daiAddress
    }
    else {
      underlyingToken = cdo.underlyingToken
    }

    return [ cdo.contract.getContractValue(), oracle.getPriceUSD(underlyingToken) ]
  }).flat()

  const data = await ethcallProvider.all(contractValueCalls)

  return cdos.map( (cdo, i) => {
    // Every even index is the contract value
    // Every odd index is the usd price of the underlying asset
    const contractValue = ethers.utils.formatUnits(data[2*i], cdo.tokenDecimals)
    const usdPrice = ethers.utils.formatEther(data[2*i + 1])

    // return contractValue * usdPrice
    return contractValue
  }) 
}

module.exports = {
  getCdos: async () => {
    // Get all CDOs from the subgraph
    const response = await axios.post(theGraphApiUrl, JSON.stringify(payload))
    let cdos = response.data.data.cdos;
    // Filter out the excluded CDOs
    cdos = cdos.filter(cdo => !excludedCDOs.includes(cdo.id.toLowerCase()));

    const cdoContracts = cdos.map(cdo => new Contract(cdo.id, cdoAbi))
    const strategyTokenContracts = cdos.map(cdo => new Contract(cdo.strategyToken, strategyTokenAbi))
    const underlyingTokenContracts = cdos.map(cdo => new Contract(cdo.underlyingToken, tokenAbi))

    // Get The symbol of the strategyToken
    const tokenSymbolCalls = strategyTokenContracts.map(contract => contract.symbol())
    const tokenSymbols = await ethcallProvider.all(tokenSymbolCalls)

    // Get the decimals of the underlying token
    const decimalsCalls = underlyingTokenContracts.map(contract => contract.decimals())
    const decimals = await ethcallProvider.all(decimalsCalls)
    // Create the oracle contract
    const oracleAddress = await contract.oracle()
    oracle = new Contract(oracleAddress, oracleAbi)

    cdos.forEach((cdo, i) => {
      cdo.contract = cdoContracts[i]
      cdo.tokenSymbol = tokenSymbols[i]
      cdo.tokenDecimals = decimals[i]
    })

    const values = await getContractValuesInUsd(cdos)
    cdos.forEach((cdo, i) => {
      cdo.oldContractValue = values[i]
    })

    return cdos
  },
  getContractValuesInUsd,
}
