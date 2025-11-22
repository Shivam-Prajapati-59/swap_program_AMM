use anchor_lang::prelude::*;

mod error;
mod instructions;
mod state;

pub use instructions::*;
pub use state::*;

declare_id!("B7eJBEskknR5nkyiLzZeXd1RtZyWzLdPLwkoKHPm9LA6");

#[program]
pub mod swap_program {
    use super::*;

    pub fn initialize_pool(ctx: Context<InitializePool>) -> Result<()> {
        instructions::initialize_pool(ctx)
    }

    pub fn add_liquidity(ctx: Context<AddLiquidity>, amount_a: u64, amount_b: u64) -> Result<()> {
        instructions::add_liquidity(ctx, amount_a, amount_b)
    }

    pub fn swap(
        ctx: Context<Swap>,
        amount_in: u64,
        minimum_amount_out: u64,
        a_to_b: bool,
    ) -> Result<()> {
        instructions::swap(ctx, amount_in, minimum_amount_out, a_to_b)
    }
}
