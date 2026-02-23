# **🐂 Tokenized Circular Cattle – Project Documentation**

## **Table of Contents**

1. Overview  
2. Key Features  
3. Quick Start  
   3.1 Prerequisites  
   3.2 Native Installation (Linux/macOS/WSL)  
   3.3 Docker \+ Dev Containers  
4. Running the Project  
   4.1 Start Local Devnet  
   4.2 Deploy Smart Contract  
   4.3 Launch Frontend  
5. How It Works  
   5.1 Auction Flow  
   5.2 ZK Circuits  
   5.3 Deployed Contracts  
6. The Starknet Privacy Toolkit (Omar's Toolkit)  
   6.1 Key Contributions  
   6.2 Why Pre‑generated Calldata?  
7. Project Structure  
8. Testing  
   8.1 Smart Contract Tests  
   8.2 Frontend Tests  
9. Deployment to Sepolia Testnet  
10. Generating Calldata for New Lots  
11. Documentation & Links  
12. Contributing & License

---

## **1\. Overview**

Tokenized Circular Cattle is a decentralized application (dApp) built on Starknet that implements sealed‑bid auctions for cattle feedlots, enhanced with zero‑knowledge proofs for privacy and trust. It enables transparent and fair bidding while preserving bidder privacy until the auction ends.

The project leverages the Scaffold‑Stark toolkit, Noir circuits, and Garaga verifiers to create a fully on‑chain, privacy‑preserving marketplace for cattle lots.

Core technologies:

* Next.js (frontend)  
* Starknet.js & Starknet‑React (Starknet integration)  
* Scarb (Cairo package manager)  
* Starknet Foundry (testing & deployment)  
* Noir (ZK circuits)  
* Garaga (on‑chain verifiers)

---

## **2\. Key Features**

* Sealed‑bid auctions – Bidders commit to a bid by sending a Poseidon hash and later reveal it.  
* ZK‑based auction finalization – The owner can finalize the auction using a zero‑knowledge proof that the declared winner is correct, without revealing all bids.  
* ZK proof of payment – The winner can generate a proof of payment to claim the lot.  
* Garaga on‑chain verifiers – Pre‑deployed Starknet verifiers for the UltraKeccakHonk proof system.  
* Multi‑lot auctions – Create multiple lots with custom metadata (breed, weight, animals, etc.).  
* Simulated payment flow – For demo purposes, a simulated payment bypasses real STRK transfer.  
* Persistent bid storage – Bids are stored in the browser’s `localStorage` for easy demo replay.

---

## **3\. Quick Start**

### **3.1 Prerequisites**

* Node.js (\>= v22)  
* Yarn (v1 or v2+)  
* Git  
* (Optional) Docker Desktop

---

### **3.2 Native Installation (Linux / macOS / WSL)**

#### **1\. Install Starkup (recommended)**

Starkup installs all the Starknet development tools with a single command:

```shell
curl --proto '=https' --tlsv1.2 -sSf https://sh.starkup.sh | sh
```

This installs:

* Scarb – Cairo package manager and build toolchain.  
* Starknet Foundry – Testing and deployment toolchain.  
* asdf – Version manager.  
* Cairo 1 VS Code extension – Syntax highlighting and language support.  
* Starknet Devnet – Local test network.

If you already have these tools, verify the versions:

```shell
scarb --version
snforge --version
starknet-devnet --version
```

#### **2\. Clone the repository**

```shell
git clone https://github.com/your-org/tokenized-circular-cattle.git
cd tokenized-circular-cattle
```

#### **3\. Install JavaScript dependencies**

```shell
yarn install
```

#### **4\. Set up environment variables**

Copy the example files and fill in your own values (especially for Sepolia testnet).

```shell
cp packages/nextjs/.env.example packages/nextjs/.env
cp packages/snfoundry/.env.example packages/snfoundry/.env
```

⚠️ Never commit your `.env` files – they are already in `.gitignore`.  
---

### **3.3 Docker \+ Dev Containers (recommended for Windows)**

1. Install [Docker Desktop](https://www.docker.com/products/docker-desktop/).  
2. Install the [Dev Containers](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers) extension for VS Code.  
3. Open the project folder in VS Code and select Reopen in Container.  
4. The container includes all tools pre‑configured (Scarb, Starknet Foundry, Starknet Devnet, etc.).

---

## **4\. Running the Project**

### **4.1 Start Local Devnet**

```shell
yarn chain
```

Devnet will run at:

```
http://127.0.0.1:5050
```

### **4.2 Deploy Smart Contract (to Devnet)**

In a second terminal:

```shell
yarn deploy
```

The deployment script (`packages/snfoundry/scripts-ts/deploy.ts`) deploys the `SealedBidFeedlot` contract and outputs its address.

### **4.3 Launch Frontend**

In a third terminal:

```shell
yarn start
```

Visit:

```
http://localhost:3000
```

You can now create lots, place bids, and interact with the auction.

---

## **5\. How It Works**

### **5.1 Auction Flow**

1. Owner creates a lot – specifies producer, breed, weight, number of animals, metadata URI, and auction duration.  
2. Bidders commit to a bid – they send a Poseidon hash of `(secret, amountLow, lotIdLow, bidder)`. The commitment is stored on‑chain and locally in `localStorage`.  
3. Bidders reveal their bid – they provide the plaintext `amount` and `nonce`. The contract verifies that the hash matches the previously stored commitment.  
4. Auction ends – after the duration expires, the owner can finalize the lot:  
   * Simple finalize – `finalize_lot` (owner only) closes the lot.  
   * ZK finalize – the owner sends a proof (from the selection circuit) to the Garaga verifier. If the proof is valid, the lot is finalized.  
5. Winner actions – the highest bidder can:  
   * Simulate a payment (demo mode)  
   * Generate a ZK payment proof using the donation badge circuit to prove they paid the required amount.

---

### **5.2 ZK Circuits**

| Circuit | Purpose | Noir Version | BB Version | Garaga System |
| :---- | :---- | :---- | :---- | :---- |
| donation\_badge | Prove payment and commitment correctness | 1.0.0‑beta.1 | 0.67.0 | ultra\_keccak\_honk |
| selection | Prove winner is the highest bid and meets price | 1.0.0‑beta.1 | 0.67.0 | ultra\_keccak\_honk |

Both circuits compile with Noir 1.0.0‑beta.1 and proofs are generated using bb 0.67.0 (UltraHonk \+ Keccak for Starknet). The calldata for the Starknet verifiers is produced by Garaga.

---

### **5.3 Deployed Contracts**

The following contracts have been deployed on Sepolia testnet and are used by the application:

| Contract | Address | Description |
| :---- | :---- | :---- |
| SealedBidFeedlot | `0x61757931878b323c6656287f004c26f6b8894f8c10c669f048c0785563970d8` | Main auction contract |
| Payment Verifier | `0x07b31788d2d06f1b80696f38ba7224f3595cc482dbd2f816165dbc7cdf476c14` | Verifier for donation\_badge circuit |
| Selection Verifier | `0x05c76e04b1384953264c98d5dc1f5b69d44e2cb6086567fe7944c62b08b58080` | Verifier for selection circuit |
| DonationBadge (ref) | `0x077ca6f2ee4624e51ed6ea6d5ca292889ca7437a0c887bf0d63f055f42ad7010` | Badge contract (from toolkit) |
| Tongo Contract (ref) | `0x00b4cca30f0f641e01140c1c388f55641f1c3fe5515484e622b6cb91d8cee585` | Used for simulated payment |

*The last two are part of the Starknet Privacy Toolkit and are referenced for completeness.*

---

## **6\. The Starknet Privacy Toolkit (Omar's Toolkit)**

The entire ZK workflow of this project is based on the [Starknet Privacy Toolkit](https://github.com/omarespejel/starknet-privacy-toolkit) by Omar Espejel. This toolkit provides an end‑to‑end reference implementation for:

* Private transfers (Tongo) – used for the simulated payment flow.  
* ZK proof generation with Noir \+ Garaga – exactly the stack used for both circuits.  
* On‑chain verifiers – Garaga‑generated contracts deployed on Sepolia.

### **6.1 Key Contributions**

* Fixed version compatibility: It prescribes Noir 1.0.0‑beta.1, bb 0.67.0, and Garaga 0.15.5 – the same combination that finally worked for generating calldata.  
* Codespaces as the recommended environment: Because the toolchain is sensitive to OS versions, the toolkit advises using GitHub Codespaces (or a Linux container) to avoid GLIBC and other compatibility issues – a lesson we learned firsthand.  
* Donation badge example: The `donation_badge` circuit and its verifier contract served as the blueprint for the payment proof part of our project.  
* Deployment addresses: The toolkit lists the contracts we reused or took as reference (see §5.3).

### **6.2 Why Pre‑generated Calldata?**

Despite the toolkit’s guidance, generating proofs dynamically in the browser proved unreliable for the selection circuit (errors like `RuntimeError: unreachable`). The toolkit itself includes a proof API (`bun run api`) that can generate proofs server‑side, but for demo stability we opted for the simplest approach: pre‑generate calldata using the exact same tools and versions, then serve the static files from `public/`. This guarantees that the on‑chain verification works every time without depending on client‑side computation.

The process described in Generating Calldata for New Lots follows exactly the steps recommended by the toolkit, adapted to our auction circuit.

---

## **7\. Project Structure**

```
packages/
├── nextjs/                 # Next.js frontend
│   ├── app/                # App router pages
│   ├── components/         # React components
│   ├── hooks/              # Custom Starknet hooks
│   ├── public/             # Static assets (calldata_*.txt, images)
│   └── services/           # Garaga service (optional)
│
├── snfoundry/              # Smart contract development
│   ├── contracts/          # Cairo contracts (src/)
│   ├── scripts-ts/         # Deployment scripts
│   └── tests/              # Starknet Foundry tests
│
└── circuits/               # Noir circuits (for local calldata generation)
    ├── donation_badge/     # Payment circuit (from toolkit)
    └── selection/          # Auction selection circuit (adapted)
```

---

## **8\. Testing**

### **8.1 Smart Contract Tests (Starknet Foundry)**

```shell
yarn test
```

### **8.2 Frontend Tests (Next.js)**

```shell
yarn test:nextjs
```

For coverage:

```shell
yarn test:nextjs run --coverage
```

---

## **9\. Deployment to Sepolia Testnet**

1. Fund your deployer account with Sepolia STRK (use a faucet like [Starknet Faucet](https://starknet-faucet.vercel.app/) or [Blastapi](https://blastapi.io/faucets/starknet-sepolia-strk)).  
2. Fill environment variables in `packages/snfoundry/.env`:

```
DEPLOYER_ADDRESS=0xYourAccountAddress
DEPLOYER_PRIVATE_KEY=0xYourPrivateKey
```

3. Configure the target network in `packages/nextjs/scaffold.config.ts`:

```ts
import { chains } from "@starknet-react/chains";
export const targetNetworks = [chains.sepolia];
```

4. Deploy the contract:

```shell
yarn deploy --network sepolia
```

5. Start the frontend and interact with the live testnet.

---

## **10\. Generating Calldata for New Lots**

After bids are revealed, obtain the bid data from the browser’s `localStorage` (key `bids_<ID>`). Each bid includes:

* `nonce` (secret)  
* `amount`  
* `bidder`  
* `lot_id`

Edit the file:

```
circuits/selection/selection/Prover.toml
```

The circuit expects exactly 8 bids. Fill unused slots with zeros and set `valid_bids` accordingly.

Example for a single bid:

```
bids = [
  { amount = 500, nonce = 12345, bidder = "0x...", lot_id = 18 },
  { amount = 0, nonce = 0, bidder = "0x0", lot_id = 0 },
  { amount = 0, nonce = 0, bidder = "0x0", lot_id = 0 },
  { amount = 0, nonce = 0, bidder = "0x0", lot_id = 0 },
  { amount = 0, nonce = 0, bidder = "0x0", lot_id = 0 },
  { amount = 0, nonce = 0, bidder = "0x0", lot_id = 0 },
  { amount = 0, nonce = 0, bidder = "0x0", lot_id = 0 },
  { amount = 0, nonce = 0, bidder = "0x0", lot_id = 0 }
]

valid_bids = [true, false, false, false, false, false, false, false]
lot_id = 18
```

Run the following commands:

```shell
cd circuits/selection/selection

nargo compile
nargo execute witness

bb prove_ultra_keccak_honk -b ./target/selection.json -w ./target/witness.gz -o ./target/proof
bb write_vk_ultra_keccak_honk -b ./target/selection.json -o ./target/vk
bb proof_as_fields_honk -k ./target/vk -p ./target/proof -o ./target/public_inputs

source ../garaga-venv/bin/activate

garaga calldata --system ultra_keccak_honk --vk ./target/vk --proof ./target/proof --public-inputs ./target/public_inputs --format starkli > ./target/calldata_lote<ID>.txt
```

Place the generated file in:

```
packages/nextjs/public/
```

---

## **11\. Documentation & Links**

* [Scaffold‑Stark Documentation](https://docs.scaffoldstark.com/)  
* [Starknet.js](https://www.starknetjs.com/)  
* [Starknet‑React](https://starknet-react.com/)  
* [Noir Lang](https://noir-lang.org/)  
* [Garaga](https://github.com/keep-starknet-strange/garaga)  
* [Starknet Privacy Toolkit (Omar's repo)](https://github.com/omarespejel/starknet-privacy-toolkit)

---

## **12\. Contributing & License**

Contributions are welcome. Please read [`CONTRIBUTING.md`](https://./CONTRIBUTING.md) for guidelines.

License – This project is licensed under the MIT License – see the [`LICENSE`](https://./LICENSE) file for details.

---

`Made with ❤️ by the Tokenized Cattle Team`