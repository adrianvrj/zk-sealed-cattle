import dotenv from 'dotenv';
dotenv.config();

export const config = {
  rpcUrl: process.env.STARKNET_RPC_URL,
  accountAddress: process.env.STARKNET_ACCOUNT_ADDRESS,
  privateKey: process.env.STARKNET_PRIVATE_KEY,
  tongoPrivateKey: process.env.TONGO_PRIVATE_KEY,
  tongoAddress: '0x00b4cca30f0f641e01140c1c388f55641f1c3fe5515484e622b6cb91d8cee585', // Sepolia
  strkAddress: '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d',
  network: 'sepolia',
};
