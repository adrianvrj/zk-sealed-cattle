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
}

#[starknet::contract]
mod SealedBidFeedlot {
    use super::{ISealedBidFeedlot, poseidon_hash_span, LotInfo, Zero, get_block_timestamp, ByteArray};
    use starknet::{ContractAddress, get_caller_address};
    use starknet::storage::{Map, StorageMapReadAccess, StorageMapWriteAccess, StoragePointerReadAccess, StoragePointerWriteAccess};

    #[storage]
    struct Storage {
        commitments: Map<(ContractAddress, u256), felt252>,
        lots: Map<u256, LotInfo>,
        owner: Map<(), ContractAddress>,
        lot_count: felt252,
    }

    #[constructor]
    fn constructor(ref self: ContractState, owner: ContractAddress) {
        self.owner.write((), owner);
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
                mejor_postor: Zero::zero(), // ✅ Dirección cero usando Zero trait
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
        }

        fn reveal_bid(ref self: ContractState, lot_id: u256, amount: u256, nonce: felt252) {
            let lot = self.lots.read(lot_id);
            assert(!lot.productor.is_zero(), 'Lot does not exist');
            assert(!lot.finalizado, 'Lot already finalized');
            assert(get_block_timestamp() < lot.start_time + lot.duration, 'Auction ended');

            let caller = get_caller_address();
            let computed_commitment = poseidon_hash_span(array![amount.low.into(), amount.high.into(), nonce.into()].span());
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
    }
}