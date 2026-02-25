use starknet::ContractAddress;
use core::num::traits::Zero;
use core::poseidon::poseidon_hash_span;
use starknet::get_block_timestamp;
use core::byte_array::ByteArray;

#[derive(Drop, Serde, starknet::Store)]
pub struct LotInfo {
    pub productor: ContractAddress,
    pub raza: felt252,
    pub peso_inicial: u256,
    pub cantidad_animales: u256,
    pub metadata_uri: ByteArray,
    pub start_time: u64,
    pub duration: u64,
    pub finalizado: bool,
    pub mejor_puja: u256,
    pub mejor_postor: ContractAddress,
}

#[starknet::interface]
pub trait ISealedBidFeedlot<TContractState> {
    fn create_lot(
        ref self: TContractState,
        lot_id: u256,
        productor: ContractAddress,
        raza: felt252,
        peso_inicial: u256,
        cantidad_animales: u256,
        metadata_uri: ByteArray,
        duration: u64
    );
    fn commit_bid(ref self: TContractState, lot_id: u256, commitment: felt252);
    fn reveal_bid(ref self: TContractState, lot_id: u256, amount: u256, nonce: felt252);
    fn finalize_lot(ref self: TContractState, lot_id: u256);
    fn get_winning_bid(self: @TContractState, lot_id: u256) -> u256;
    fn get_lot_info(self: @TContractState, lot_id: u256) -> LotInfo;
    fn get_lot_count(self: @TContractState) -> u256;
    // Nuevas funciones para ZK
    fn set_auction_verifier(ref self: TContractState, verifier_address: ContractAddress);
    fn finalize_with_zk(ref self: TContractState, lot_id: u256, winner: ContractAddress, winner_amount: u256, proof: Span<felt252>);
    // Función para obtener el contador de postores
    fn get_bidders_count(self: @TContractState, lot_id: u256) -> u32;
    // Función para obtener un postor por índice
    fn get_bidder_at(self: @TContractState, lot_id: u256, index: u32) -> ContractAddress;
}

// Interface para el verificador de selección
#[starknet::interface]
pub trait IAuctionVerifier<TContractState> {
    fn verify_ultra_keccak_honk_proof(self: @TContractState, full_proof_with_hints: Span<felt252>) -> Option<Span<u256>>;
}

#[starknet::contract]
mod SealedBidFeedlot {
    use super::{ISealedBidFeedlot, IAuctionVerifier, poseidon_hash_span, LotInfo, Zero, get_block_timestamp, ByteArray};
    use starknet::{ContractAddress, get_caller_address};
    use starknet::storage::{Map, StorageMapReadAccess, StorageMapWriteAccess, StoragePointerReadAccess, StoragePointerWriteAccess};

    #[storage]
    struct Storage {
        commitments: Map<(ContractAddress, u256), felt252>,
        lots: Map<u256, LotInfo>,
        owner: Map<(), ContractAddress>,
        lot_count: felt252,
        // Nuevo: contador de postores por lote
        bidders_count: Map<u256, u32>,
        // Nuevo: mapeo de (lote, índice) -> dirección de postor
        bidder_at: Map<(u256, u32), ContractAddress>,
        // Nuevo: dirección del verificador de selección
        auction_verifier: ContractAddress,
    }

    #[constructor]
    fn constructor(ref self: ContractState, owner: ContractAddress) {
        self.owner.write((), owner);
        self.auction_verifier.write(Zero::zero());
    }

    #[abi(embed_v0)]
    impl SealedBidFeedlotImpl of ISealedBidFeedlot<ContractState> {
        fn create_lot(
            ref self: ContractState,
            lot_id: u256,
            productor: ContractAddress,
            raza: felt252,
            peso_inicial: u256,
            cantidad_animales: u256,
            metadata_uri: ByteArray,
            duration: u64
        ) {
            assert(get_caller_address() == self.owner.read(()), 'Not owner');
            let existing = self.lots.read(lot_id);
            assert(existing.productor.is_zero(), 'Lot already exists');

            let lot = LotInfo {
                productor,
                raza,
                peso_inicial,
                cantidad_animales,
                metadata_uri,
                start_time: get_block_timestamp(),
                duration,
                finalizado: false,
                mejor_puja: 0_u256,
                mejor_postor: Zero::zero(),
            };
            self.lots.write(lot_id, lot);
            
            let current_count = self.lot_count.read();
            self.lot_count.write(current_count + 1);
        }

        fn commit_bid(ref self: ContractState, lot_id: u256, commitment: felt252) {
            let lot = self.lots.read(lot_id);
            assert(!lot.productor.is_zero(), 'Lot does not exist');
            assert(!lot.finalizado, 'Lot already finalized');
            assert(get_block_timestamp() < lot.start_time + lot.duration, 'Auction ended');

            let caller = get_caller_address();
            self.commitments.write((caller, lot_id), commitment);
            
            // Verificar si el postor ya existe en la lista
            let count = self.bidders_count.read(lot_id);
            let mut already_exists = false;
            let mut i = 0;
            while i < count {
                if self.bidder_at.read((lot_id, i)) == caller {
                    already_exists = true;
                    break;
                };
                i += 1;
            };
            
            if !already_exists {
                // Añadir nuevo postor
                self.bidder_at.write((lot_id, count), caller);
                self.bidders_count.write(lot_id, count + 1);
            }
        }

        fn reveal_bid(ref self: ContractState, lot_id: u256, amount: u256, nonce: felt252) {
            let lot = self.lots.read(lot_id);
            assert(!lot.productor.is_zero(), 'Lot does not exist');
            assert(!lot.finalizado, 'Lot already finalized');
            assert(get_block_timestamp() < lot.start_time + lot.duration, 'Auction ended');

            let caller = get_caller_address();
            let computed_commitment = poseidon_hash_span(
                array![nonce, amount.low.into(), lot_id.low.into(), caller.into()].span()
            );
            let stored_commitment = self.commitments.read((caller, lot_id));
            assert(computed_commitment == stored_commitment, 'Commitment mismatch');

            if amount > lot.mejor_puja {
                let mut updated_lot = lot;
                updated_lot.mejor_puja = amount;
                updated_lot.mejor_postor = caller;
                self.lots.write(lot_id, updated_lot);
            }
        }

        fn finalize_lot(ref self: ContractState, lot_id: u256) {
            assert(get_caller_address() == self.owner.read(()), 'Not owner');
            let mut lot = self.lots.read(lot_id);
            assert(!lot.finalizado, 'Already finalized');
            lot.finalizado = true;
            self.lots.write(lot_id, lot);
        }

        fn get_winning_bid(self: @ContractState, lot_id: u256) -> u256 {
            self.lots.read(lot_id).mejor_puja
        }

        fn get_lot_info(self: @ContractState, lot_id: u256) -> LotInfo {
            self.lots.read(lot_id)
        }

        fn get_lot_count(self: @ContractState) -> u256 {
            self.lot_count.read().into()
        }

        fn get_bidders_count(self: @ContractState, lot_id: u256) -> u32 {
            self.bidders_count.read(lot_id)
        }

        fn get_bidder_at(self: @ContractState, lot_id: u256, index: u32) -> ContractAddress {
            self.bidder_at.read((lot_id, index))
        }

        // Nueva función para establecer el verificador de selección
        fn set_auction_verifier(ref self: ContractState, verifier_address: ContractAddress) {
            assert(get_caller_address() == self.owner.read(()), 'Not owner');
            self.auction_verifier.write(verifier_address);
        }

        // Nueva función para finalizar con prueba ZK
        fn finalize_with_zk(
            ref self: ContractState,
            lot_id: u256,
            winner: ContractAddress,
            winner_amount: u256,
            proof: Span<felt252>
        ) {
            // Verificar que es el owner
            assert(get_caller_address() == self.owner.read(()), 'Not owner');
            
            // Verificar que el lote existe y no está finalizado
            let lot = self.lots.read(lot_id);
            assert(!lot.productor.is_zero(), 'Lot does not exist');
            assert(!lot.finalizado, 'Already finalized');
            
            // Verificar que el verificador está configurado
            let verifier_address = self.auction_verifier.read();
            assert(!verifier_address.is_zero(), 'Verifier not set');
            
            // Llamada manual al verificador usando syscall
            let selector = selector!("verify_ultra_keccak_honk_proof");
            
            // Usar starknet::syscalls::call_contract_syscall
            let result = starknet::syscalls::call_contract_syscall(
                verifier_address,
                selector,
                proof
            );
            
            // Verificar que la llamada fue exitosa
            match result {
                Result::Ok(_) => {},
                Result::Err(_) => assert(false, 'Proof verification failed'),
            };
            
            // Actualizar lote
            let mut updated_lot = lot;
            updated_lot.finalizado = true;
            updated_lot.mejor_postor = winner;
            updated_lot.mejor_puja = winner_amount;
            self.lots.write(lot_id, updated_lot);
            
            // Emitir evento
            self.emit(AuctionFinalized { lot_id, winner, winner_amount });
        }
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        AuctionFinalized: AuctionFinalized,
    }

    #[derive(Drop, starknet::Event)]
    struct AuctionFinalized {
        #[key]
        lot_id: u256,
        winner: ContractAddress,
        winner_amount: u256,
    }
}