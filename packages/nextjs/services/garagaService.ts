import * as garaga from 'garaga';

let initialized = false;

/**
 * Inicializa el módulo WASM de Garaga (debe llamarse una sola vez).
 */
export async function initGaraga() {
  if (!initialized) {
    try {
      await garaga.init();
      initialized = true;
      console.log('✅ Garaga WASM initialized');
    } catch (error) {
      console.error('❌ Failed to initialize Garaga:', error);
      throw new Error('Garaga initialization failed');
    }
  }
}

/**
 * Genera el calldata para el verificador UltraKeccakZKHonk a partir de los archivos binarios.
 * @param proof - Uint8Array del proof
 * @param publicInputs - Uint8Array de los public inputs
 * @param vk - Uint8Array de la verification key
 * @returns Promise<bigint[]> - Array de bigints listo para usar en la transacción
 */
export async function generateCalldata(
  proof: Uint8Array,
  publicInputs: Uint8Array,
  vk: Uint8Array
): Promise<bigint[]> {
  await initGaraga();

  try {
    // La función exacta según la documentación: getZKHonkCallData
    // Retorna un array de bigints (felt252)
    const calldata = garaga.getZKHonkCallData(proof, publicInputs, vk);
    console.log(`✅ Calldata generated with ${calldata.length} elements`);
    return calldata;
  } catch (error) {
    console.error('❌ Error generating calldata with Garaga:', error);
    throw new Error('Failed to generate calldata');
  }
}