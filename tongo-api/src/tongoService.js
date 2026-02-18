import { Account as TongoAccount } from '@fatsolutions/tongo-sdk';
import { Account, RpcProvider } from 'starknet';
import { config } from './config.js';

let provider, signer, tongoAccount;

export async function initTongo() {
  provider = new RpcProvider({
    nodeUrl: config.rpcUrl,
    specVersion: '0.8.1',
  });

  signer = new Account(provider, config.accountAddress, config.privateKey);

  tongoAccount = new TongoAccount(
    config.tongoPrivateKey,
    config.tongoAddress,
    provider
  );

  console.log('✅ Tongo SDK inicializado');
  console.log('🔑 Tongo Address (base58):', tongoAccount.tongoAddress());
}

export async function getBalances() {
  const state = await tongoAccount.state();
  return {
    currentBalance: state.balance.toString(),
    pendingBalance: state.pending.toString(),
    nonce: state.nonce,
  };
}

export async function fund(amountInStrk) {
  const amountBase = BigInt(amountInStrk) * 10n ** 18n;
  const amountTongo = await tongoAccount.erc20ToTongo(amountBase);
  const fundOp = await tongoAccount.fund({
    amount: amountTongo,
    sender: signer.address,
  });

  const calls = [];
  if (fundOp.approve) {
    calls.push(fundOp.approve);
  }
  calls.push(fundOp.toCalldata());

  const tx = await signer.execute(calls);
  await provider.waitForTransaction(tx.transaction_hash);
  return tx.transaction_hash;
}

export async function transfer(recipientTongoAddress, amountInStrk) {
  const amountBase = BigInt(amountInStrk) * 10n ** 18n;
  const amountTongo = await tongoAccount.erc20ToTongo(amountBase);
  const transferOp = await tongoAccount.transfer({
    to: recipientTongoAddress,
    amount: amountTongo,
    sender: signer.address,
  });

  const tx = await signer.execute([transferOp.toCalldata()]);
  await provider.waitForTransaction(tx.transaction_hash);
  return tx.transaction_hash;
}

export async function withdraw(amountInStrk) {
  const amountBase = BigInt(amountInStrk) * 10n ** 18n;
  const amountTongo = await tongoAccount.erc20ToTongo(amountBase);
  const withdrawOp = await tongoAccount.withdraw({
    amount: amountTongo,
    to: signer.address,
    sender: signer.address,
  });

  const tx = await signer.execute([withdrawOp.toCalldata()]);
  await provider.waitForTransaction(tx.transaction_hash);
  return tx.transaction_hash;
}
