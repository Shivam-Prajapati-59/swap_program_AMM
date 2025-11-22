use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};

use crate::state::Pool;

#[derive(Accounts)]
pub struct AddLiquidity<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [b"pool", pool.mint_a.as_ref(), pool.mint_b.as_ref()],
        bump = pool.bump
    )]
    pub pool: Account<'info, Pool>,

    pub mint_a: InterfaceAccount<'info, Mint>,
    pub mint_b: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        token::mint = mint_a,
        token::authority = user
    )]
    pub user_token_a: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = mint_b,
        token::authority = user
    )]
    pub user_token_b: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [b"vault_a", pool.key().as_ref()],
        bump,
        token::mint = mint_a,
        token::authority = pool
    )]
    pub vault_a: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [b"vault_b", pool.key().as_ref()],
        bump,
        token::mint = mint_b,
        token::authority = pool
    )]
    pub vault_b: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn add_liquidity(ctx: Context<AddLiquidity>, amount_a: u64, amount_b: u64) -> Result<()> {
    // Transfer token A from user to vault
    let cpi_accounts_a = TransferChecked {
        from: ctx.accounts.user_token_a.to_account_info(),
        to: ctx.accounts.vault_a.to_account_info(),
        authority: ctx.accounts.user.to_account_info(),
        mint: ctx.accounts.mint_a.to_account_info(),
    };

    let cpi_ctx_a = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts_a);

    token_interface::transfer_checked(cpi_ctx_a, amount_a, ctx.accounts.mint_a.decimals)?;

    // Transfer token B from user to vault
    let cpi_accounts_b = TransferChecked {
        from: ctx.accounts.user_token_b.to_account_info(),
        to: ctx.accounts.vault_b.to_account_info(),
        authority: ctx.accounts.user.to_account_info(),
        mint: ctx.accounts.mint_b.to_account_info(),
    };

    let cpi_ctx_b = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts_b);

    token_interface::transfer_checked(cpi_ctx_b, amount_b, ctx.accounts.mint_b.decimals)?;

    Ok(())
}
