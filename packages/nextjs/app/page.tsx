"use client";

import { useAccount, useContract, useSendTransaction } from "@starknet-react/core";
import { useState, useMemo, useEffect } from "react";
import { poseidonHashMany } from "micro-starknet";
import deployedContracts from "~~/contracts/deployedContracts";

const contractData = deployedContracts.devnet?.SealedBidFeedlot;

interface LotMetadata {
  nombre?: string;
  productor?: string;
  raza?: string;
  peso_promedio_kg?: number;
  cantidad_animales?: number;
  fecha_creacion?: string;
  certificaciones?: string[];
  imagenes?: string[];
  descripcion?: string;
}

export default function Home() {
  const { account } = useAccount();
  const { contract } = useContract({
    abi: contractData?.abi,
    address: contractData?.address,
  });

  // Estados de permisos
  const [owner, setOwner] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);

  // Estados para creación de lote
  const [newLotId, setNewLotId] = useState("");
  const [newProductor, setNewProductor] = useState("");
  const [newRaza, setNewRaza] = useState("");
  const [newPeso, setNewPeso] = useState("");
  const [newCantidad, setNewCantidad] = useState("");
  const [newMetadata, setNewMetadata] = useState("");
  const [newDuration, setNewDuration] = useState("3600");

  // Estados para los lotes
  const [lots, setLots] = useState<any[]>([]);
  const [loadingLots, setLoadingLots] = useState(true);
  const [selectedLotId, setSelectedLotId] = useState<string>("");
  const [selectedLotInfo, setSelectedLotInfo] = useState<any>(null);
  const [selectedLotMetadata, setSelectedLotMetadata] = useState<LotMetadata | null>(null);
  const [currentTime, setCurrentTime] = useState(Math.floor(Date.now() / 1000));

  // Actualizar tiempo cada segundo
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Math.floor(Date.now() / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Estados para commit/reveal
  const [amount, setAmount] = useState("");
  const [nonce, setNonce] = useState(Math.floor(Math.random() * 1000000).toString());
  const [isLoading, setIsLoading] = useState(false);
  const [committed, setCommitted] = useState(false);
  const [commitment, setCommitment] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [showPaymentButton, setShowPaymentButton] = useState(false);
  const [paymentDone, setPaymentDone] = useState(false);

  // Owner (primera cuenta de devnet)
  useEffect(() => {
    if (account) {
      const ownerAddress = "0x64b48806902a367c8598f4f95c305e8c1a1acba5f082d294a43793113115691";
      setOwner(ownerAddress);
      setIsOwner(account.address === ownerAddress);
    }
  }, [account]);

  // Cargar todos los lotes
  useEffect(() => {
    const fetchAllLots = async () => {
      if (!contract) {
        setLoadingLots(false);
        return;
      }
      setLoadingLots(true);
      try {
        const count = await contract.get_lot_count();
        const num = Number(count);
        const lotsArray = [];
        for (let i = 1; i <= num; i++) {
          try {
            const info = await contract.get_lot_info(i);
            // Convertir todos los campos a string de forma segura
            const productor = info.productor ? info.productor.toString() : "";
            const raza = info.raza ? info.raza.toString() : "";
            const peso_inicial = info.peso_inicial ? info.peso_inicial.toString() : "0";
            const cantidad_animales = info.cantidad_animales ? info.cantidad_animales.toString() : "0";
            // metadata_uri puede ser felt252 o ByteArray; lo convertimos a string
            const metadataUri = info.metadata_uri ? info.metadata_uri.toString() : "";
            
            let metadata = null;
            // Intentar cargar metadata de IPFS solo si la URI es válida (con el prefijo correcto)
            if (metadataUri.startsWith('ipfs://')) {
              const cid = metadataUri.replace('ipfs://', '');
              const gatewayUrl = `https://gateway.pinata.cloud/ipfs/${cid}`;
              try {
                const res = await fetch(gatewayUrl);
                if (res.ok) {
                  metadata = await res.json();
                } else {
                  console.warn(`IPFS gateway responded with status ${res.status} for ${gatewayUrl}`);
                }
              } catch (e) {
                console.warn(`Error fetching IPFS metadata for lot ${i}:`, e);
                // No interrumpimos la carga de la página, simplemente seguimos sin metadata
              }
            } else {
              console.log(`Lot ${i} metadata_uri is not an IPFS URI:`, metadataUri);
            }
            
            lotsArray.push({
              id: i,
              productor,
              raza,
              peso_inicial,
              cantidad_animales,
              metadata_uri: metadataUri,
              start_time: Number(info.start_time),
              duration: Number(info.duration),
              finalizado: info.finalizado,
              mejor_puja: info.mejor_puja ? info.mejor_puja.toString() : "0",
              metadata,
            });
          } catch (e) {
            console.error(`Error obteniendo lote ${i}:`, e);
            // Continuamos con el siguiente lote
          }
        }
        setLots(lotsArray);
      } catch (e) {
        console.error("Error fetching lot count:", e);
      } finally {
        setLoadingLots(false);
      }
    };
    fetchAllLots();
  }, [contract]);

  // Cuando se selecciona un lote
  const handleSelectLot = (lot: any) => {
    setSelectedLotId(lot.id.toString());
    setSelectedLotInfo(lot);
    setSelectedLotMetadata(lot.metadata);
    setCommitted(false);
    setCommitment("");
    setAmount("");
    setNonce(Math.floor(Math.random() * 1000000).toString());
    setShowPaymentButton(false);
    setPaymentDone(false);
  };

  // Determinar si una subasta está activa
  const isAuctionActive = (lot: any) => {
    if (!lot) return false;
    if (lot.finalizado) return false;
    const endTime = lot.start_time + lot.duration;
    return currentTime < endTime;
  };

  // Tiempo restante formateado
  const getTimeRemaining = (lot: any) => {
    if (!lot) return "";
    const endTime = lot.start_time + lot.duration;
    const remaining = endTime - currentTime;
    if (remaining <= 0) return "Terminada";
    const hours = Math.floor(remaining / 3600);
    const minutes = Math.floor((remaining % 3600) / 60);
    const seconds = remaining % 60;
    return `${hours}h ${minutes}m ${seconds}s`;
  };

  const splitU256 = (value: bigint) => {
    const mask = (1n << 128n) - 1n;
    const low = value & mask;
    const high = value >> 128n;
    return { low, high };
  };

  const calculatedCommitment = useMemo(() => {
    if (!amount || !nonce || committed) return "";
    try {
      const amountBig = BigInt(amount);
      const nonceBig = BigInt(nonce);
      const { low, high } = splitU256(amountBig);
      return poseidonHashMany([low, high, nonceBig]).toString();
    } catch (e) {
      console.error("Error calculando commitment:", e);
      return "";
    }
  }, [amount, nonce, committed]);

  // Calls
  const createLotCalls = useMemo(() => {
    if (!contract || !account || !newLotId || !newProductor || !newRaza || !newPeso || !newCantidad || !newMetadata || !newDuration) return [];
    return [contract.populate("create_lot", [
      BigInt(newLotId),
      newProductor,
      newRaza,
      BigInt(newPeso),
      BigInt(newCantidad),
      newMetadata,
      BigInt(newDuration)
    ])];
  }, [contract, account, newLotId, newProductor, newRaza, newPeso, newCantidad, newMetadata, newDuration]);

  const commitCalls = useMemo(() => {
    if (!contract || !account || !amount || !calculatedCommitment || committed || !selectedLotId) return [];
    return [contract.populate("commit_bid", [selectedLotId, calculatedCommitment])];
  }, [contract, account, amount, calculatedCommitment, selectedLotId, committed]);

  const revealCalls = useMemo(() => {
    if (!contract || !account || !amount || !nonce || !committed || !selectedLotId) return [];
    return [contract.populate("reveal_bid", [selectedLotId, BigInt(amount), nonce])];
  }, [contract, account, amount, nonce, selectedLotId, committed]);

  const finalizeCalls = useMemo(() => {
    if (!contract || !account || !selectedLotId) return [];
    return [contract.populate("finalize_lot", [selectedLotId])];
  }, [contract, account, selectedLotId]);

  const { sendAsync: sendCreateLot } = useSendTransaction({ calls: createLotCalls });
  const { sendAsync: sendCommit } = useSendTransaction({ calls: commitCalls });
  const { sendAsync: sendReveal } = useSendTransaction({ calls: revealCalls });
  const { sendAsync: sendFinalize } = useSendTransaction({ calls: finalizeCalls });

  const handleCreateLot = async () => {
    setErrorMessage("");
    if (!sendCreateLot) return;
    if (!isOwner) {
      setErrorMessage("❌ Solo el owner puede crear lotes");
      return;
    }
    setIsLoading(true);
    try {
      const tx = await sendCreateLot();
      await account?.waitForTransaction(tx.transaction_hash);
      alert("✅ Lote creado exitosamente");
      setNewLotId("");
      setNewProductor("");
      setNewRaza("");
      setNewPeso("");
      setNewCantidad("");
      setNewMetadata("");
      setNewDuration("3600");
      // Recargar lotes (simplemente volvemos a ejecutar la carga)
      // Para simplificar, recargamos la página o volvemos a llamar a fetchAllLots
      window.location.reload(); // opción rápida, pero puedes mejorarlo
    } catch (e: any) {
      console.error(e);
      setErrorMessage("❌ Error al crear lote: " + (e.message || "desconocido"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleCommit = async () => {
    setErrorMessage("");
    if (!sendCommit) return;
    if (!isAuctionActive(selectedLotInfo)) {
      setErrorMessage("❌ La subasta no está activa (ya terminó o fue finalizada)");
      return;
    }
    setIsLoading(true);
    try {
      const tx = await sendCommit();
      await account?.waitForTransaction(tx.transaction_hash);
      setCommitment(calculatedCommitment);
      setCommitted(true);
      alert("✅ Commit exitoso. Ahora revela.");
    } catch (e: any) {
      console.error(e);
      setErrorMessage("❌ Error en commit: " + (e.message || "desconocido"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleReveal = async () => {
    setErrorMessage("");
    if (!sendReveal) return;
    if (!isAuctionActive(selectedLotInfo)) {
      setErrorMessage("❌ La subasta no está activa");
      return;
    }
    setIsLoading(true);
    try {
      const tx = await sendReveal();
      await account?.waitForTransaction(tx.transaction_hash);
      
      // Actualizar la información del lote (simplificado, podrías recargar)
      const updatedInfo = await contract?.get_lot_info(selectedLotId);
      if (updatedInfo) {
        const updatedLot = {
          ...selectedLotInfo,
          mejor_puja: updatedInfo.mejor_puja?.toString() || "0",
        };
        setSelectedLotInfo(updatedLot);
        setLots(lots.map(l => l.id.toString() === selectedLotId ? updatedLot : l));
      }
      
      // Si después de revelar, esta puja es la mejor, mostrar botón de pago simulado
      if (updatedInfo?.mejor_puja?.toString() === amount && account) {
        setShowPaymentButton(true);
      }

      alert("✅ Puja revelada");
    } catch (e: any) {
      console.error(e);
      setErrorMessage("❌ Error en reveal: " + (e.message || "desconocido"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSimulatedPayment = () => {
    setPaymentDone(true);
    setShowPaymentButton(false);
    alert("✅ Pago privado simulado con Tongo (integración real en progreso)");
  };

  const handleFinalize = async () => {
    setErrorMessage("");
    if (!sendFinalize) return;
    if (!isOwner) {
      setErrorMessage("❌ Solo el owner puede finalizar");
      return;
    }
    setIsLoading(true);
    try {
      const tx = await sendFinalize();
      await account?.waitForTransaction(tx.transaction_hash);
      
      const updatedInfo = await contract?.get_lot_info(selectedLotId);
      if (updatedInfo) {
        const updatedLot = {
          ...selectedLotInfo,
          finalizado: updatedInfo.finalizado,
        };
        setSelectedLotInfo(updatedLot);
        setLots(lots.map(l => l.id.toString() === selectedLotId ? updatedLot : l));
      }
      
      alert("✅ Lote finalizado");
    } catch (e: any) {
      console.error(e);
      setErrorMessage("❌ Error al finalizar: " + (e.message || "desconocido"));
    } finally {
      setIsLoading(false);
    }
  };

  if (!account) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <p className="text-xl">Conectá tu wallet para comenzar</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-8 max-w-6xl">
      <h1 className="text-3xl font-bold mb-6 text-center">🐂 Subasta Sellada de Feedlots</h1>

      {errorMessage && (
        <div className="alert alert-error mb-4">
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Formulario de creación de lotes (solo owner) */}
      {isOwner && (
        <div className="card bg-base-100 shadow-xl p-6 mb-8">
          <h2 className="text-2xl font-semibold mb-4">➕ Crear Nuevo Lote</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input
              type="text"
              className="input input-bordered"
              placeholder="ID del lote (número)"
              value={newLotId}
              onChange={(e) => setNewLotId(e.target.value)}
            />
            <input
              type="text"
              className="input input-bordered"
              placeholder="Dirección del productor"
              value={newProductor}
              onChange={(e) => setNewProductor(e.target.value)}
            />
            <input
              type="text"
              className="input input-bordered"
              placeholder="Raza"
              value={newRaza}
              onChange={(e) => setNewRaza(e.target.value)}
            />
            <input
              type="number"
              className="input input-bordered"
              placeholder="Peso inicial (kg)"
              value={newPeso}
              onChange={(e) => setNewPeso(e.target.value)}
              step="1"
            />
            <input
              type="number"
              className="input input-bordered"
              placeholder="Cantidad de animales"
              value={newCantidad}
              onChange={(e) => setNewCantidad(e.target.value)}
              step="1"
            />
            <input
              type="text"
              className="input input-bordered md:col-span-2"
              placeholder="URI de metadata (ipfs://...)"
              value={newMetadata}
              onChange={(e) => setNewMetadata(e.target.value)}
            />
            <input
              type="number"
              className="input input-bordered"
              placeholder="Duración (segundos, ej. 3600 para 1h)"
              value={newDuration}
              onChange={(e) => setNewDuration(e.target.value)}
              step="1"
            />
          </div>
          <button
            className="btn btn-primary w-full mt-4"
            onClick={handleCreateLot}
            disabled={isLoading || !newLotId || !newProductor || !newRaza || !newPeso || !newCantidad || !newMetadata || !newDuration}
          >
            {isLoading ? "Enviando..." : "Crear Lote"}
          </button>
        </div>
      )}

      {/* Tabla de lotes */}
      <div className="card bg-base-100 shadow-xl p-6 mb-8">
        <h2 className="text-2xl font-semibold mb-4">📋 Lotes disponibles</h2>
        {loadingLots ? (
          <p>Cargando lotes...</p>
        ) : lots.length === 0 ? (
          <p>No hay lotes creados aún.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table table-zebra">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Productor</th>
                  <th>Raza</th>
                  <th>Peso (kg)</th>
                  <th>Cantidad</th>
                  <th>Tiempo restante</th>
                  <th>Mejor puja</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {lots.map((lot) => {
                  const active = isAuctionActive(lot);
                  return (
                    <tr key={lot.id} className={selectedLotId === lot.id.toString() ? "bg-primary/10" : ""}>
                      <td>{lot.id}</td>
                      <td>{lot.productor.slice(0, 10)}...</td>
                      <td>{lot.raza}</td>
                      <td>{lot.peso_inicial}</td>
                      <td>{lot.cantidad_animales}</td>
                      <td>
                        {lot.finalizado ? "Finalizado" : (active ? getTimeRemaining(lot) : "Terminada")}
                      </td>
                      <td>
                        {lot.finalizado || !active ? lot.mejor_puja : "🔒 Oculta"}
                      </td>
                      <td>
                        <button
                          className="btn btn-sm btn-primary"
                          onClick={() => handleSelectLot(lot)}
                          disabled={lot.finalizado || !active}
                        >
                          {lot.finalizado ? "Finalizado" : (active ? "Ofertar" : "Terminada")}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Panel de oferta (solo si hay un lote seleccionado) */}
      {selectedLotInfo && (
        <div className="card bg-base-200 p-6 mb-8">
          <h3 className="text-xl font-semibold mb-4">💰 Ofertar en Lote #{selectedLotId}</h3>
          
          {/* Detalles del lote seleccionado */}
          <div className="grid grid-cols-2 gap-4 mb-6 p-4 bg-base-300 rounded-lg">
            <div><strong>Productor:</strong> {selectedLotInfo.productor}</div>
            <div><strong>Raza:</strong> {selectedLotInfo.raza}</div>
            <div><strong>Peso inicial:</strong> {selectedLotInfo.peso_inicial} kg</div>
            <div><strong>Cantidad:</strong> {selectedLotInfo.cantidad_animales}</div>
            <div><strong>Estado:</strong> {selectedLotInfo.finalizado ? "Finalizado" : (isAuctionActive(selectedLotInfo) ? "Activo" : "Terminada")}</div>
            {!selectedLotInfo.finalizado && isAuctionActive(selectedLotInfo) && (
              <div><strong>Tiempo restante:</strong> {getTimeRemaining(selectedLotInfo)}</div>
            )}
            <div><strong>Mejor puja:</strong> {
              selectedLotInfo.finalizado || !isAuctionActive(selectedLotInfo) 
                ? selectedLotInfo.mejor_puja 
                : "🔒 Oculta (se revelará al terminar)"
            }</div>
            {selectedLotMetadata && (
              <>
                <div className="col-span-2"><strong>Descripción:</strong> {selectedLotMetadata.descripcion}</div>
                {selectedLotMetadata.certificaciones && (
                  <div className="col-span-2"><strong>Certificaciones:</strong> {selectedLotMetadata.certificaciones.join(', ')}</div>
                )}
              </>
            )}
          </div>

          {/* Formulario de commit/reveal (solo si la subasta está activa) */}
          {isAuctionActive(selectedLotInfo) && !selectedLotInfo.finalizado ? (
            <div className="space-y-4">
              <input
                type="number"
                className="input input-bordered w-full"
                placeholder="Cantidad a pujar (entero)"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                step="1"
                disabled={committed}
              />

              <div className="flex gap-2">
                <input
                  type="text"
                  className="input input-bordered flex-1"
                  placeholder="Nonce (secreto)"
                  value={nonce}
                  onChange={(e) => setNonce(e.target.value)}
                  disabled={committed}
                />
                {!committed && (
                  <button
                    className="btn btn-secondary"
                    onClick={() => setNonce(Math.floor(Math.random() * 1000000).toString())}
                  >
                    🎲
                  </button>
                )}
              </div>

              {calculatedCommitment && !committed && (
                <div className="alert alert-info text-xs break-all">
                  <strong>Commitment a enviar:</strong> {calculatedCommitment}
                </div>
              )}

              {commitment && committed && (
                <div className="alert alert-success text-xs break-all">
                  <strong>Commitment enviado:</strong> {commitment}
                </div>
              )}

              <button
                className="btn btn-primary w-full"
                onClick={handleCommit}
                disabled={isLoading || !amount || !sendCommit || committed}
              >
                {isLoading ? "Enviando..." : "1. Enviar Commit"}
              </button>

              <input
                type="text"
                className="input input-bordered w-full bg-gray-100"
                placeholder="Nonce (revelar)"
                value={nonce}
                readOnly
                disabled={!committed}
              />

              <button
                className="btn btn-secondary w-full"
                onClick={handleReveal}
                disabled={isLoading || !amount || !sendReveal || !committed}
              >
                {isLoading ? "Enviando..." : "2. Revelar Puja"}
              </button>

              {showPaymentButton && !paymentDone && (
                <button
                  className="btn btn-accent w-full mt-4"
                  onClick={handleSimulatedPayment}
                  disabled={isLoading}
                >
                  {isLoading ? "Procesando..." : "💰 Pagar con Privacidad (Simulado)"}
                </button>
              )}
            </div>
          ) : (
            <div className="alert alert-warning">
              Esta subasta ha terminado. {selectedLotInfo.finalizado ? "Fue finalizada manualmente." : "El tiempo de puja ha expirado."}
            </div>
          )}

          {/* Botón de finalizar manual (solo owner) */}
          {isOwner && !selectedLotInfo.finalizado && (
            <button
              className="btn btn-warning w-full mt-4"
              onClick={handleFinalize}
              disabled={isLoading || !sendFinalize}
            >
              {isLoading ? "Enviando..." : "Finalizar Lote Manualmente (solo owner)"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}