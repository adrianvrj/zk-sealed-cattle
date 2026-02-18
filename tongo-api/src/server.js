import express from 'express';
import cors from 'cors';
import { initTongo, getBalances, fund, transfer, withdraw } from './tongoService.js';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3002;

await initTongo();

app.get('/api/state', async (req, res) => {
  try {
    const balances = await getBalances();
    res.json(balances);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/fund', async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount) throw new Error('Falta amount');
    const txHash = await fund(amount);
    res.json({ txHash });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/transfer', async (req, res) => {
  try {
    const { recipientTongoAddress, amount } = req.body;
    if (!recipientTongoAddress || !amount) throw new Error('Faltan parámetros');
    const txHash = await transfer(recipientTongoAddress, amount);
    res.json({ txHash });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/withdraw', async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount) throw new Error('Falta amount');
    const txHash = await withdraw(amount);
    res.json({ txHash });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 API Tongo en http://localhost:${PORT}`);
});
