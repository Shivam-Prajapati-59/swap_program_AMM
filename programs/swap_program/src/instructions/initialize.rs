use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::state::Pool;

#[derive(Accounts)]
pub struct InitializePool<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + Pool::INIT_SPACE,
        seeds = [b"pool", mint_a.key().as_ref(), mint_b.key().as_ref()],
        bump
    )]
    pub pool: Account<'info, Pool>,

    pub mint_a: InterfaceAccount<'info, Mint>,
    pub mint_b: InterfaceAccount<'info, Mint>,

    #[account(
        init,
        payer = authority,
        token::mint = mint_a,
        token::authority = pool,
        seeds = [b"vault_a", pool.key().as_ref()],
        bump
    )]
    pub vault_a: InterfaceAccount<'info, TokenAccount>,

    #[account(
        init,
        payer = authority,
        token::mint = mint_b,
        token::authority = pool,
        seeds = [b"vault_b", pool.key().as_ref()],
        bump
    )]
    pub vault_b: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn initialize_pool(ctx: Context<InitializePool>) -> Result<()> {
    let pool = &mut ctx.accounts.pool;
    pool.authority = ctx.accounts.authority.key();
    pool.mint_a = ctx.accounts.mint_a.key();
    pool.mint_b = ctx.accounts.mint_b.key();
    pool.vault_a = ctx.accounts.vault_a.key();
    pool.vault_b = ctx.accounts.vault_b.key();
    pool.bump = ctx.bumps.pool;

    Ok(())
}
