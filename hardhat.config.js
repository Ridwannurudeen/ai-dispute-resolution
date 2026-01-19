// hardhat.config.js
require("@nomicfoundation/hardhat-toolbox");
require("@nomicfoundation/hardhat-verify");
require("dotenv").config();

const PRIVATE_KEY = process.env.PRIVATE_KEY || "0x0000000000000000000000000000000000000000000000000000000000000001";
const BASE_RPC_URL = process.env.BASE_RPC_URL || "https://mainnet.base.org";
const BASE_SEPOLIA_RPC_URL = process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";
const BASESCAN_API_KEY = process.env.BASESCAN_API_KEY || "";

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
    solidity: {
        version: "0.8.20",
        settings: {
            optimizer: {
                enabled: true,
                runs: 200
            },
            viaIR: true
        }
    },
    networks: {
        hardhat: {
            chainId: 31337,
            forking: {
                url: BASE_RPC_URL,
                enabled: process.env.FORK_ENABLED === "true"
            }
        },
        localhost: {
            url: "http://127.0.0.1:8545",
            chainId: 31337
        },
        base: {
            url: BASE_RPC_URL,
            chainId: 8453,
            accounts: [PRIVATE_KEY],
            gasPrice: "auto",
            verify: {
                etherscan: {
                    apiUrl: "https://api.basescan.org/api",
                    apiKey: BASESCAN_API_KEY
                }
            }
        },
        "base-sepolia": {
            url: BASE_SEPOLIA_RPC_URL,
            chainId: 84532,
            accounts: [PRIVATE_KEY],
            gasPrice: "auto",
            verify: {
                etherscan: {
                    apiUrl: "https://api-sepolia.basescan.org/api",
                    apiKey: BASESCAN_API_KEY
                }
            }
        }
    },
    etherscan: {
        apiKey: {
            base: BASESCAN_API_KEY,
            "base-sepolia": BASESCAN_API_KEY
        },
        customChains: [
            {
                network: "base",
                chainId: 8453,
                urls: {
                    apiURL: "https://api.basescan.org/api",
                    browserURL: "https://basescan.org"
                }
            },
            {
                network: "base-sepolia",
                chainId: 84532,
                urls: {
                    apiURL: "https://api-sepolia.basescan.org/api",
                    browserURL: "https://sepolia.basescan.org"
                }
            }
        ]
    },
    sourcify: {
        enabled: true
    },
    paths: {
        sources: "./contracts",
        tests: "./test",
        cache: "./cache",
        artifacts: "./artifacts"
    },
    mocha: {
        timeout: 100000
    },
    gasReporter: {
        enabled: process.env.REPORT_GAS === "true",
        currency: "USD",
        coinmarketcap: process.env.COINMARKETCAP_API_KEY,
        outputFile: "gas-report.txt",
        noColors: true
    }
};
