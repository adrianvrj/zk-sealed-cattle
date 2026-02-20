"use client";

import { useAccount, useContract, useSendTransaction } from "@starknet-react/core";
import { useState, useMemo, useEffect, useRef } from "react";
import { poseidonHashMany } from "micro-starknet";
import toast from "react-hot-toast";
import deployedContracts from "~~/contracts/deployedContracts";

const contractData = deployedContracts.devnet?.SealedBidFeedlot;

const RAZAS = ["Angus", "Hereford", "Braford", "Brangus", "Limousin", "Charolais", "Otra"];

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

function toHexAddress(addr: any): string {
  if (!addr) return "0x0";
  try {
    const big = BigInt(addr);
    return '0x' + big.toString(16).padStart(64, '0');
  } catch {
    return String(addr);
  }
}

function normalizeAddress(addr: string): string {
  if (!addr) return '';
  const hex = addr.replace('0x', '').replace(/^0+/, '');
  return '0x' + (hex || '0');
}

export default function Home() {
  const { account } = useAccount();
  const { contract } = useContract({
    abi: contractData?.abi,
    address: contractData?.address,
  });

  const [owner, setOwner] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);

  const [newProductor, setNewProductor] = useState("");
  const [newRaza, setNewRaza] = useState("");
  const [newPeso, setNewPeso] = useState("");
  const [newCantidad, setNewCantidad] = useState("");
  const [newMetadata, setNewMetadata] = useState("");
  const [newDuration, setNewDuration] = useState("3600");
  const [nextLotId, setNextLotId] = useState("1");

  const [lots, setLots] = useState<any[]>([]);
  const [loadingLots, setLoadingLots] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedLotId, setSelectedLotId] = useState<string>("");
  const [selectedLotInfo, setSelectedLotInfo] = useState<any>(null);
  const [selectedLotMetadata, setSelectedLotMetadata] = useState<LotMetadata | null>(null);
  const [currentTime, setCurrentTime] = useState(Math.floor(Date.now() / 1000));

  const [amount, setAmount] = useState("");
  const [nonce, setNonce] = useState(Math.floor(Math.random() * 1000000).toString());
  const [isLoading, setIsLoading] = useState(false);
  const [committed, setCommitted] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [commitment, setCommitment] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  // Estados de persistencia por cuenta (simples objetos)
  const [paidLotes, setPaidLotes] = useState<Record<string, boolean>>({});
  const [participatedLotes, setParticipatedLotes] = useState<Record<string, boolean>>({});

  // Cargar datos de la cuenta cuando está disponible
  useEffect(() => {
    if (!account) return;
    const accountKey = account.address.toLowerCase();
    const savedPaid = localStorage.getItem(`paidLotes_${accountKey}`);
    if (savedPaid) {
      try {
        setPaidLotes(JSON.parse(savedPaid));
      } catch (e) {
        console.error('Error parsing paidLotes', e);
      }
    }
    const savedParticipated = localStorage.getItem(`participatedLotes_${accountKey}`);
    if (savedParticipated) {
      try {
        setParticipatedLotes(JSON.parse(savedParticipated));
      } catch (e) {
        console.error('Error parsing participatedLotes', e);
      }
    }
  }, [account]);

  // Guardar cambios
  useEffect(() => {
    if (!account) return;
    const accountKey = account.address.toLowerCase();
    localStorage.setItem(`paidLotes_${accountKey}`, JSON.stringify(paidLotes));
  }, [paidLotes, account]);

  useEffect(() => {
    if (!account) return;
    const accountKey = account.address.toLowerCase();
    localStorage.setItem(`participatedLotes_${accountKey}`, JSON.stringify(participatedLotes));
  }, [participatedLotes, account]);

  // Reloj
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Math.floor(Date.now() / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Owner
  useEffect(() => {
    if (account) {
      const ownerAddress = "0x64b48806902a367c8598f4f95c305e8c1a1acba5f082d294a43793113115691";
      setOwner(ownerAddress);
      setIsOwner(account.address === ownerAddress);
    }
  }, [account]);

  // Cargar lotes desde el contrato
  const fetchAllLots = async (showRefreshing = false) => {
    if (!contract) return;
    if (showRefreshing) setRefreshing(true);
    else setLoadingLots(true);
    try {
      const count = await contract.get_lot_count();
      const num = Number(count);
      setNextLotId(String(num + 1));
      const lotsArray = [];
      for (let i = 1; i <= num; i++) {
        try {
          const info = await contract.get_lot_info(i);
          let metadata = null;
          const metadataUri = info.metadata_uri ? info.metadata_uri.toString() : "";

          if (metadataUri.startsWith('ipfs://')) {
            const cid = metadataUri.replace('ipfs://', '');
            const gatewayUrl = `https://gateway.pinata.cloud/ipfs/${cid}`;
            try {
              const res = await fetch(gatewayUrl);
              if (res.ok) {
                metadata = await res.json();
              }
            } catch (e) {
              // Silently ignore
            }
          }

          const productorHex = toHexAddress(info.productor);
          const mejorPostorHex = toHexAddress(info.mejor_postor);

          lotsArray.push({
            id: i,
            productor: productorHex,
            raza: info.raza.toString(),
            peso_inicial: info.peso_inicial?.toString(),
            cantidad_animales: info.cantidad_animales?.toString(),
            metadata_uri: metadataUri,
            start_time: Number(info.start_time),
            duration: Number(info.duration),
            finalizado: info.finalizado,
            mejor_puja: info.mejor_puja?.toString() || "0",
            mejor_postor: mejorPostorHex,
            metadata,
          });
        } catch (e) {
          // Ignorar errores por lote
        }
      }
      setLots(lotsArray);
    } catch (e) {
      toast.error("Error al cargar los lotes");
    } finally {
      setLoadingLots(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAllLots();
  }, [contract]);

  const handleSelectLot = (lot: any) => {
    setSelectedLotId(lot.id.toString());
    setSelectedLotInfo(lot);
    setSelectedLotMetadata(lot.metadata);
    setCommitted(false);
    setRevealed(false);
    setCommitment("");
    setAmount("");
    setNonce(Math.floor(Math.random() * 1000000).toString());
  };

  const isAuctionActive = (lot: any) => {
    if (!lot) return false;
    if (lot.finalizado) return false;
    const endTime = lot.start_time + lot.duration;
    return currentTime < endTime;
  };

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

  const getRazaNombre = (razaIndex: string) => {
    const index = parseInt(razaIndex, 10);
    return !isNaN(index) && RAZAS[index] ? RAZAS[index] : razaIndex;
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
      return "";
    }
  }, [amount, nonce, committed]);

  const createLotCalls = useMemo(() => {
    if (!contract || !account || !nextLotId || !newProductor || !newRaza || !newPeso || !newCantidad || !newMetadata || !newDuration) return [];
    return [contract.populate("create_lot", [
      BigInt(nextLotId),
      newProductor,
      newRaza,
      BigInt(newPeso),
      BigInt(newCantidad),
      newMetadata,
      BigInt(newDuration)
    ])];
  }, [contract, account, nextLotId, newProductor, newRaza, newPeso, newCantidad, newMetadata, newDuration]);

  const commitCalls = useMemo(() => {
    if (!contract || !account || !amount || !calculatedCommitment || committed || !selectedLotId) return [];
    return [contract.populate("commit_bid", [selectedLotId, calculatedCommitment])];
  }, [contract, account, amount, calculatedCommitment, selectedLotId, committed]);

  const revealCalls = useMemo(() => {
    if (!contract || !account || !amount || !nonce || !committed || revealed || !selectedLotId) return [];
    return [contract.populate("reveal_bid", [selectedLotId, BigInt(amount), nonce])];
  }, [contract, account, amount, nonce, committed, revealed, selectedLotId]);

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
      toast.success("✅ Lote creado exitosamente");
      setNewProductor("");
      setNewRaza("");
      setNewPeso("");
      setNewCantidad("");
      setNewMetadata("");
      setNewDuration("3600");
      await fetchAllLots();
    } catch (e: any) {
      toast.error("❌ Error al crear lote");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCommit = async () => {
    setErrorMessage("");
    if (!sendCommit) return;
    if (!isAuctionActive(selectedLotInfo)) {
      toast.error("❌ La subasta no está activa");
      return;
    }
    setIsLoading(true);
    try {
      const tx = await sendCommit();
      await account?.waitForTransaction(tx.transaction_hash);
      setCommitment(calculatedCommitment);
      setCommitted(true);
      toast.success("✅ Commit exitoso. Ahora revela.");
    } catch (e: any) {
      toast.error("❌ Error en commit");
    } finally {
      setIsLoading(false);
    }
  };

  const handleReveal = async () => {
    setErrorMessage("");
    if (!sendReveal) return;
    if (!isAuctionActive(selectedLotInfo)) {
      toast.error("❌ La subasta no está activa");
      return;
    }
    setIsLoading(true);
    try {
      const tx = await sendReveal();
      await account?.waitForTransaction(tx.transaction_hash);

      const updatedInfo = await contract?.get_lot_info(selectedLotId);
      const updatedLot = {
        ...selectedLotInfo,
        ...updatedInfo,
        productor: toHexAddress(updatedInfo.productor),
        raza: updatedInfo.raza.toString(),
        peso_inicial: updatedInfo.peso_inicial?.toString(),
        cantidad_animales: updatedInfo.cantidad_animales?.toString(),
        metadata_uri: updatedInfo.metadata_uri?.toString() || "",
        start_time: Number(updatedInfo.start_time),
        duration: Number(updatedInfo.duration),
        finalizado: updatedInfo.finalizado,
        mejor_puja: updatedInfo.mejor_puja?.toString() || "0",
        mejor_postor: toHexAddress(updatedInfo.mejor_postor),
      };
      setSelectedLotInfo(updatedLot);
      setLots(lots.map(l => l.id.toString() === selectedLotId ? updatedLot : l));

      // Marcar participación
      setParticipatedLotes(prev => ({ ...prev, [selectedLotId]: true }));

      setRevealed(true);
      toast.success("✅ Puja revelada");
    } catch (e: any) {
      toast.error("❌ Error en reveal");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSimulatedPayment = () => {
    if (!account || !selectedLotInfo) return;
    setPaidLotes(prev => ({ ...prev, [selectedLotId]: true }));
    toast.success("✅ Pago privado simulado con Tongo");
  };

  const handleFinalize = async () => {
    if (!window.confirm("¿Estás seguro de que quieres finalizar este lote?")) return;
    setErrorMessage("");
    if (!sendFinalize) return;
    if (!isOwner) {
      toast.error("❌ Solo el owner puede finalizar");
      return;
    }
    setIsLoading(true);
    try {
      const tx = await sendFinalize();
      await account?.waitForTransaction(tx.transaction_hash);

      const updatedInfo = await contract?.get_lot_info(selectedLotId);
      const updatedLot = {
        ...selectedLotInfo,
        ...updatedInfo,
        productor: toHexAddress(updatedInfo.productor),
        raza: updatedInfo.raza.toString(),
        peso_inicial: updatedInfo.peso_inicial?.toString(),
        cantidad_animales: updatedInfo.cantidad_animales?.toString(),
        metadata_uri: updatedInfo.metadata_uri?.toString() || "",
        start_time: Number(updatedInfo.start_time),
        duration: Number(updatedInfo.duration),
        finalizado: updatedInfo.finalizado,
        mejor_puja: updatedInfo.mejor_puja?.toString() || "0",
        mejor_postor: toHexAddress(updatedInfo.mejor_postor),
      };
      setSelectedLotInfo(updatedLot);
      setLots(lots.map(l => l.id.toString() === selectedLotId ? updatedLot : l));

      toast.success("✅ Lote finalizado");
    } catch (e: any) {
      toast.error("❌ Error al finalizar");
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

  const userHasParticipated = participatedLotes[selectedLotId];
  const hasPaid = paidLotes[selectedLotId];
  const accountKey = account.address.toLowerCase(); // para tooltips

  return (
    <div className="container mx-auto p-4 md:p-8 max-w-7xl">
      <h1 className="text-3xl font-bold mb-6 text-center">🐂 Subasta Sellada de Feedlots</h1>

      {errorMessage && (
        <div className="alert alert-error mb-4">
          <span>{errorMessage}</span>
        </div>
      )}

      {isOwner && (
        <div className="card bg-base-100 shadow-xl p-6 mb-8">
          <h2 className="text-2xl font-semibold mb-4">➕ Crear Nuevo Lote</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input
              type="text"
              className="input input-bordered bg-gray-100"
              placeholder="ID del lote (automático)"
              value={nextLotId}
              readOnly
            />
            <input
              type="text"
              className="input input-bordered"
              placeholder="Dirección del productor"
              value={newProductor}
              onChange={(e) => setNewProductor(e.target.value)}
            />
            <select
              className="select input-bordered"
              value={newRaza}
              onChange={(e) => setNewRaza(e.target.value)}
            >
              <option value="">Seleccionar raza</option>
              {RAZAS.map((raza, index) => (
                <option key={index} value={index}>{raza}</option>
              ))}
            </select>
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
            disabled={isLoading || !newProductor || !newRaza || !newPeso || !newCantidad || !newMetadata || !newDuration}
          >
            {isLoading ? "Creando..." : "Crear Lote"}
          </button>
        </div>
      )}

      <div className="card bg-base-100 shadow-xl p-6 mb-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
          <h2 className="text-2xl font-semibold">📋 Lotes disponibles</h2>
          <button
            className="btn btn-outline btn-sm"
            onClick={() => fetchAllLots(true)}
            disabled={loadingLots || refreshing}
          >
            {refreshing ? (
              <span className="loading loading-spinner loading-xs"></span>
            ) : (
              "↻ Refrescar"
            )}
          </button>
        </div>
        {loadingLots ? (
          <div className="flex justify-center items-center py-12">
            <span className="loading loading-spinner loading-lg"></span>
          </div>
        ) : lots.length === 0 ? (
          <p>No hay lotes creados aún.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table table-zebra w-full">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Productor</th>
                  <th>Raza</th>
                  <th>Peso (kg)</th>
                  <th>Cantidad</th>
                  <th className="hidden md:table-cell">Tiempo restante</th>
                  <th className="hidden lg:table-cell">Mejor puja</th>
                  <th>Estado</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {lots.map((lot) => {
                  const active = isAuctionActive(lot);
                  const razaNombre = getRazaNombre(lot.raza);
                  const esGanador = lot.finalizado && normalizeAddress(lot.mejor_postor) === normalizeAddress(account.address);
                  const pagado = esGanador && paidLotes[lot.id.toString()];

                  return (
                    <tr
                      key={lot.id}
                      className={`hover:bg-base-300 cursor-pointer ${selectedLotId === lot.id.toString() ? "bg-primary/20" : ""}`}
                      onClick={() => handleSelectLot(lot)}
                    >
                      <td>{lot.id}</td>
                      <td className="tooltip tooltip-top" data-tip={lot.productor}>
                        {lot.productor?.slice(0, 6)}...
                      </td>
                      <td>{razaNombre}</td>
                      <td>{lot.peso_inicial}</td>
                      <td>{lot.cantidad_animales}</td>
                      <td className="hidden md:table-cell">
                        {lot.finalizado ? "Finalizado" : (active ? getTimeRemaining(lot) : "Terminada")}
                      </td>
                      <td className="hidden lg:table-cell">
                        {lot.finalizado ? lot.mejor_puja : "🔒"}
                      </td>
                      <td>
                        {pagado ? (
                          <span className="badge badge-success badge-sm md:badge-md">Pagado</span>
                        ) : esGanador ? (
                          <span className="badge badge-warning badge-sm md:badge-md">Pendiente</span>
                        ) : lot.finalizado ? (
                          <span className="badge badge-neutral badge-sm md:badge-md">Finalizado</span>
                        ) : active ? (
                          <span className="badge badge-info badge-sm md:badge-md">Activo</span>
                        ) : (
                          <span className="badge badge-ghost badge-sm md:badge-md">Terminado</span>
                        )}
                      </td>
                      <td>
                        {active && !lot.finalizado && !participatedLotes[lot.id.toString()] ? (
                          <button
                            className="btn btn-xs md:btn-sm btn-primary"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelectLot(lot);
                            }}
                          >
                            Ofertar
                          </button>
                        ) : (
                          <button
                            className="btn btn-xs md:btn-sm btn-ghost"
                            disabled
                          >
                            {lot.finalizado ? "Finalizado" : (participatedLotes[lot.id.toString()] ? "Ya participaste" : "Terminado")}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedLotInfo && (
        <div className="card bg-base-200 p-6 mb-8">
          <h3 className="text-xl font-semibold mb-4">💰 Lote #{selectedLotId}</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 p-4 bg-base-300 rounded-lg">
            <div><strong>Productor:</strong> <span className="tooltip" data-tip={selectedLotInfo.productor}>{selectedLotInfo.productor?.slice(0, 10)}...</span></div>
            <div><strong>Raza:</strong> {getRazaNombre(selectedLotInfo.raza)}</div>
            <div><strong>Peso inicial:</strong> {selectedLotInfo.peso_inicial} kg</div>
            <div><strong>Cantidad:</strong> {selectedLotInfo.cantidad_animales}</div>
            <div><strong>Estado:</strong> {selectedLotInfo.finalizado ? "Finalizado" : (isAuctionActive(selectedLotInfo) ? "Activo" : "Terminada")}</div>
            {!selectedLotInfo.finalizado && isAuctionActive(selectedLotInfo) && (
              <div><strong>Tiempo restante:</strong> {getTimeRemaining(selectedLotInfo)}</div>
            )}
            <div><strong>Mejor puja:</strong> {selectedLotInfo.finalizado ? selectedLotInfo.mejor_puja : "🔒 Oculta"}</div>
            {selectedLotInfo.finalizado && (
              <div><strong>Ganador:</strong> <span className="tooltip" data-tip={selectedLotInfo.mejor_postor}>{selectedLotInfo.mejor_postor?.slice(0, 10)}...</span></div>
            )}
            {selectedLotMetadata && (
              <>
                <div className="col-span-1 md:col-span-2"><strong>Descripción:</strong> {selectedLotMetadata.descripcion}</div>
                {selectedLotMetadata.certificaciones && (
                  <div className="col-span-1 md:col-span-2"><strong>Certificaciones:</strong> {selectedLotMetadata.certificaciones.join(', ')}</div>
                )}
              </>
            )}
          </div>

          {isOwner && !selectedLotInfo.finalizado && (
            <button
              className="btn btn-warning w-full mb-4"
              onClick={handleFinalize}
              disabled={isLoading || !sendFinalize}
            >
              {isLoading ? "Finalizando..." : "Finalizar Lote Manualmente (solo owner)"}
            </button>
          )}

          {userHasParticipated ? (
            <div className="alert alert-info mb-4">
              Ya has realizado una oferta en este lote. No puedes ofertar nuevamente.
            </div>
          ) : isAuctionActive(selectedLotInfo) && !selectedLotInfo.finalizado ? (
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
                disabled={isLoading || !amount || !sendReveal || !committed || revealed}
              >
                {isLoading ? "Enviando..." : "2. Revelar Puja"}
              </button>
            </div>
          ) : !isAuctionActive(selectedLotInfo) && !selectedLotInfo.finalizado ? (
            <div className="alert alert-warning">
              El tiempo de puja ha expirado. Espera a que el owner finalice la subasta.
            </div>
          ) : null}

          {selectedLotInfo.finalizado &&
            normalizeAddress(selectedLotInfo.mejor_postor) === normalizeAddress(account.address) &&
            !hasPaid && (
              <button
                className="btn btn-accent w-full mt-4"
                onClick={handleSimulatedPayment}
                disabled={isLoading}
              >
                {isLoading ? "Procesando..." : "💰 Pagar con Privacidad (Simulado)"}
              </button>
            )}

          {selectedLotInfo.finalizado && hasPaid && (
            <div className="alert alert-success mt-4">
              ✅ Has realizado el pago de este lote correctamente. Gracias por tu participación.
            </div>
          )}
        </div>
      )}
    </div>
  );
}