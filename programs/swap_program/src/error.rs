use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Slippage tolerance exceeded: Output amount is below minimum required")]
    SlippageTooHigh,
    #[msg("Mathematical overflow occurred during calculation")]
    MathOverflow,
}
