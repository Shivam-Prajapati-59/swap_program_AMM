use anchor_lang::prelude::*;

declare_id!("B7eJBEskknR5nkyiLzZeXd1RtZyWzLdPLwkoKHPm9LA6");

#[program]
pub mod swap_program {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
