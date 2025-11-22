use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};

use crate::error::ErrorCode;
use crate::state::Pool;

#[derive(Accounts)]
pub struct Swap<'info> {
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [b"pool", pool.mint_a.as_ref(), pool.mint_b.as_ref()],
        bump = pool.bump
    )]
    pub pool: Account<'info, Pool>,

    pub mint_a: InterfaceAccount<'info, Mint>,
    pub mint_b: InterfaceAccount<'info, Mint>,

    #[account(mut)]
    pub user_token_a: InterfaceAccount<'info, TokenAccount>,

    #[account(mut)]
    pub user_token_b: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [b"vault_a", pool.key().as_ref()],
        bump,
        token::mint = pool.mint_a,
        token::authority = pool,
    )]
    pub vault_a: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [b"vault_b", pool.key().as_ref()],
        bump,
        token::mint = pool.mint_b,
        token::authority = pool
    )]
    pub vault_b: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn swap(
    ctx: Context<Swap>,
    amount_in: u64,
    minimum_amount_out: u64,
    a_to_b: bool,
) -> Result<()> {
    // Get current balances
    let balance_a = ctx.accounts.vault_a.amount;
    let balance_b = ctx.accounts.vault_b.amount;

    // Calculate output amount using constant product formula (x * y = k)
    let amount_out = if a_to_b {
        calculate_swap_output(amount_in, balance_a, balance_b)?
    } else {
        calculate_swap_output(amount_in, balance_b, balance_a)?
    };

    require!(amount_out >= minimum_amount_out, ErrorCode::SlippageTooHigh);

    // Perform the swap
    if a_to_b {
        // Transfer token A from user to vault
        let cpi_accounts_in = TransferChecked {
            from: ctx.accounts.user_token_a.to_account_info(),
            mint: ctx.accounts.mint_a.to_account_info(),
            to: ctx.accounts.vault_a.to_account_info(),
            authority: ctx.accounts.user.to_account_info(),
        };

        let cpi_ctx_in = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            cpi_accounts_in,
        );

        token_interface::transfer_checked(cpi_ctx_in, amount_in, ctx.accounts.mint_a.decimals)?;

        // Transfer token B from vault to user
        let seeds = &[
            b"pool",
            ctx.accounts.pool.mint_a.as_ref(),
            ctx.accounts.pool.mint_b.as_ref(),
            &[ctx.accounts.pool.bump],
        ];

        let signer = &[&seeds[..]];

        let cpi_accounts_out = TransferChecked {
            from: ctx.accounts.vault_b.to_account_info(),
            mint: ctx.accounts.mint_b.to_account_info(),
            to: ctx.accounts.user_token_b.to_account_info(),
            authority: ctx.accounts.pool.to_account_info(),
        };

        let cpi_ctx_out = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            cpi_accounts_out,
            signer,
        );

        token_interface::transfer_checked(cpi_ctx_out, amount_out, ctx.accounts.mint_b.decimals)?;
    } else {
        // Transfer token B from user to vault
        let cpi_accounts_in = TransferChecked {
            from: ctx.accounts.user_token_b.to_account_info(),
            mint: ctx.accounts.mint_b.to_account_info(),
            to: ctx.accounts.vault_b.to_account_info(),
            authority: ctx.accounts.user.to_account_info(),
        };

        let cpi_ctx_in = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            cpi_accounts_in,
        );

        token_interface::transfer_checked(cpi_ctx_in, amount_in, ctx.accounts.mint_b.decimals)?;

        // Transfer token A from vault to user
        let seeds = &[
            b"pool",
            ctx.accounts.pool.mint_a.as_ref(),
            ctx.accounts.pool.mint_b.as_ref(),
            &[ctx.accounts.pool.bump],
        ];

        let signer = &[&seeds[..]];

        let cpi_accounts_out = TransferChecked {
            from: ctx.accounts.vault_a.to_account_info(),
            mint: ctx.accounts.mint_a.to_account_info(),
            to: ctx.accounts.user_token_a.to_account_info(),
            authority: ctx.accounts.pool.to_account_info(),
        };

        let cpi_ctx_out = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            cpi_accounts_out,
            signer,
        );

        token_interface::transfer_checked(cpi_ctx_out, amount_out, ctx.accounts.mint_a.decimals)?;
    }

    Ok(())
}

fn calculate_swap_output(amount_in: u64, reserve_in: u64, reserve_out: u64) -> Result<u64> {
    let numerator = (amount_in as u128)
        .checked_mul(reserve_out as u128)
        .ok_or(ErrorCode::MathOverflow)?;

    let denominator = (reserve_in as u128)
        .checked_add(amount_in as u128)
        .ok_or(ErrorCode::MathOverflow)?;

    let amount_out = numerator
        .checked_div(denominator)
        .ok_or(ErrorCode::MathOverflow)?;

    Ok(amount_out as u64)
}
