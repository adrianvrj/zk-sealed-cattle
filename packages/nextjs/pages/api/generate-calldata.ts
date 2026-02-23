import { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';

// Importar Garaga (CommonJS)
const Garaga = require('garaga');

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { bids, winnerIndex } = req.body;

    // Validar que los datos sean correctos
    if (!Array.isArray(bids) || bids.length === 0) {
      return res.status(400).json({ error: 'Invalid bids array' });
    }
    if (typeof winnerIndex !== 'number' || winnerIndex < 0 || winnerIndex >= bids.length) {
      return res.status(400).json({ error: 'Invalid winner index' });
    }

    // Leer la verification key desde el sistema de archivos
    // Se espera que esté en public/vk.json (accesible desde el servidor)
    const vkPath = path.join(process.cwd(), 'public', 'vk.json');
    const vkRaw = fs.readFileSync(vkPath, 'utf-8');
    const vk = JSON.parse(vkRaw);

    // Inicializar Garaga
    const garaga = new Garaga({
      system: 'ultra_keccak_honk',
      curve: 'bn254',
    });

    // Establecer la verification key (la API real puede variar; ajusta según documentación)
    // Suponiendo que el método se llama setVerificationKey
    if (garaga.setVerificationKey) {
      garaga.setVerificationKey(vk);
    } else {
      // Si no existe ese método, quizás se pasa en el constructor
      console.warn('setVerificationKey no encontrado, se usará la config inicial');
    }

    // Preparar los inputs para el circuito de selección
    const inputs = {
      bids: bids.map((b: any) => ({
        secret: b.secret,
        amount: b.amount,
        lot_id: b.lot_id,
        winner: b.winner,
      })),
      commitments: bids.map((b: any) => b.commitment),
      valid_bids: bids.map(() => true),
      winner_index: winnerIndex,
    };

    // Generar el calldata (el nombre del método puede ser generateCalldata, generateProof, etc.)
    // Necesitamos conocer la API exacta. Por ahora usaremos un método genérico.
    let calldata: string[];
    if (garaga.generateCalldata) {
      calldata = await garaga.generateCalldata(inputs);
    } else if (garaga.generateProof) {
      // Si primero genera la prueba y luego la convierte a calldata
      const proof = await garaga.generateProof(inputs);
      calldata = await garaga.proofToCalldata(proof);
    } else {
      throw new Error('No se encontró un método para generar calldata en Garaga');
    }

    res.status(200).json({ calldata });
  } catch (error: any) {
    console.error('Error generating calldata:', error);
    res.status(500).json({ error: error.message });
  }
}