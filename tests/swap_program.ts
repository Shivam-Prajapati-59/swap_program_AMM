import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { SwapProgram } from "../target/types/swap_program";
import {
  createMint,
  createAccount,
  mintTo,
  getAccount,
} from "@solana/spl-token";
import {
  PublicKey,
  Keypair,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { assert } from "chai";

describe("swap_program", () => {
  // Configure the client to use the local cluster
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.SwapProgram as Program<SwapProgram>;

  // Test accounts
  let authority: Keypair;
  let user: Keypair;
  let mintA: PublicKey;
  let mintB: PublicKey;
  let userTokenAccountA: PublicKey;
  let userTokenAccountB: PublicKey;
  let poolPda: PublicKey;
  let vaultAPda: PublicKey;
  let vaultBPda: PublicKey;

  // Test constants
  const INITIAL_MINT_AMOUNT = new BN(1_000_000_000); // 1 billion tokens
  const LIQUIDITY_AMOUNT_A = new BN(100_000_000); // 100 million
  const LIQUIDITY_AMOUNT_B = new BN(200_000_000); // 200 million
  const SWAP_AMOUNT = new BN(10_000_000); // 10 million

  before(async () => {
    // Create test keypairs
    authority = Keypair.generate();
    user = Keypair.generate();

    // Airdrop SOL to authority and user
    const airdropSignature1 = await provider.connection.requestAirdrop(
      authority.publicKey,
      10 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropSignature1);

    const airdropSignature2 = await provider.connection.requestAirdrop(
      user.publicKey,
      10 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropSignature2);

    // Create Token Mints
    mintA = await createMint(
      provider.connection,
      authority,
      authority.publicKey,
      null,
      9 // 9 decimals
    );

    mintB = await createMint(
      provider.connection,
      authority,
      authority.publicKey,
      null,
      9 // 9 decimals
    );

    console.log("Mint A:", mintA.toString());
    console.log("Mint B:", mintB.toString());

    // Create user token accounts
    userTokenAccountA = await createAccount(
      provider.connection,
      user,
      mintA,
      user.publicKey
    );

    userTokenAccountB = await createAccount(
      provider.connection,
      user,
      mintB,
      user.publicKey
    );

    // Mint tokens to user
    await mintTo(
      provider.connection,
      authority,
      mintA,
      userTokenAccountA,
      authority.publicKey,
      INITIAL_MINT_AMOUNT.toNumber()
    );

    await mintTo(
      provider.connection,
      authority,
      mintB,
      userTokenAccountB,
      authority.publicKey,
      INITIAL_MINT_AMOUNT.toNumber()
    );

    console.log("User Token Account A:", userTokenAccountA.toString());
    console.log("User Token Account B:", userTokenAccountB.toString());

    // Derive PDAs
    [poolPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("pool"), mintA.toBuffer(), mintB.toBuffer()],
      program.programId
    );

    [vaultAPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault_a"), poolPda.toBuffer()],
      program.programId
    );

    [vaultBPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault_b"), poolPda.toBuffer()],
      program.programId
    );

    console.log("Pool PDA:", poolPda.toString());
    console.log("Vault A PDA:", vaultAPda.toString());
    console.log("Vault B PDA:", vaultBPda.toString());
  });

  it("Initializes the pool", async () => {
    const tx = await program.methods
      .initializePool()
      .accounts({
        authority: authority.publicKey,
        mintA: mintA,
        mintB: mintB,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
      })
      .signers([authority])
      .rpc();

    console.log("Initialize Pool Transaction:", tx);

    // Fetch the pool account
    const poolAccount = await program.account.pool.fetch(poolPda);

    // Verify pool state
    assert.equal(
      poolAccount.authority.toString(),
      authority.publicKey.toString(),
      "Authority mismatch"
    );
    assert.equal(
      poolAccount.mintA.toString(),
      mintA.toString(),
      "Mint A mismatch"
    );
    assert.equal(
      poolAccount.mintB.toString(),
      mintB.toString(),
      "Mint B mismatch"
    );
    assert.equal(
      poolAccount.vaultA.toString(),
      vaultAPda.toString(),
      "Vault A mismatch"
    );
    assert.equal(
      poolAccount.vaultB.toString(),
      vaultBPda.toString(),
      "Vault B mismatch"
    );

    console.log("✓ Pool initialized successfully");
  });

  it("Adds liquidity to the pool", async () => {
    const tx = await program.methods
      .addLiquidity(LIQUIDITY_AMOUNT_A, LIQUIDITY_AMOUNT_B)
      .accounts({
        user: user.publicKey,
        pool: poolPda,
        mintA: mintA,
        mintB: mintB,
        userTokenA: userTokenAccountA,
        userTokenB: userTokenAccountB,
        vaultA: vaultAPda,
        vaultB: vaultBPda,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
      })
      .signers([user])
      .rpc();

    console.log("Add Liquidity Transaction:", tx);

    // Check vault balances
    const vaultAAccount = await getAccount(provider.connection, vaultAPda);
    const vaultBAccount = await getAccount(provider.connection, vaultBPda);

    assert.equal(
      vaultAAccount.amount.toString(),
      LIQUIDITY_AMOUNT_A.toString(),
      "Vault A balance mismatch"
    );
    assert.equal(
      vaultBAccount.amount.toString(),
      LIQUIDITY_AMOUNT_B.toString(),
      "Vault B balance mismatch"
    );

    console.log("✓ Liquidity added successfully");
    console.log("Vault A Balance:", vaultAAccount.amount.toString());
    console.log("Vault B Balance:", vaultBAccount.amount.toString());
  });

  it("Swaps token A for token B", async () => {
    // Get balances before swap
    const userAccountABefore = await getAccount(
      provider.connection,
      userTokenAccountA
    );
    const userAccountBBefore = await getAccount(
      provider.connection,
      userTokenAccountB
    );
    const vaultABefore = await getAccount(provider.connection, vaultAPda);
    const vaultBBefore = await getAccount(provider.connection, vaultBPda);

    // Calculate expected output (simplified constant product formula)
    const reserveA = new BN(vaultABefore.amount.toString());
    const reserveB = new BN(vaultBBefore.amount.toString());
    const amountIn = SWAP_AMOUNT;

    // expected_out = (amount_in * reserve_out) / (reserve_in + amount_in)
    const expectedAmountOut = amountIn
      .mul(reserveB)
      .div(reserveA.add(amountIn));

    const minimumAmountOut = expectedAmountOut.mul(new BN(90)).div(new BN(100)); // 10% slippage tolerance

    console.log("Swapping", SWAP_AMOUNT.toString(), "token A for token B");
    console.log("Expected output:", expectedAmountOut.toString());
    console.log("Minimum output:", minimumAmountOut.toString());

    const tx = await program.methods
      .swap(SWAP_AMOUNT, minimumAmountOut, true) // true = A to B
      .accounts({
        user: user.publicKey,
        pool: poolPda,
        mintA: mintA,
        mintB: mintB,
        userTokenA: userTokenAccountA,
        userTokenB: userTokenAccountB,
        vaultA: vaultAPda,
        vaultB: vaultBPda,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
      })
      .signers([user])
      .rpc();

    console.log("Swap Transaction:", tx);

    // Get balances after swap
    const userAccountAAfter = await getAccount(
      provider.connection,
      userTokenAccountA
    );
    const userAccountBAfter = await getAccount(
      provider.connection,
      userTokenAccountB
    );
    const vaultAAfter = await getAccount(provider.connection, vaultAPda);
    const vaultBAfter = await getAccount(provider.connection, vaultBPda);

    // Verify token A was taken from user
    assert.equal(
      new BN(userAccountABefore.amount.toString())
        .sub(new BN(userAccountAAfter.amount.toString()))
        .toString(),
      SWAP_AMOUNT.toString(),
      "Token A not deducted correctly"
    );

    // Verify token B was given to user
    const actualAmountOut = new BN(userAccountBAfter.amount.toString()).sub(
      new BN(userAccountBBefore.amount.toString())
    );

    assert.isTrue(
      actualAmountOut.gte(minimumAmountOut),
      "Output amount less than minimum"
    );

    // Verify vault balances
    assert.equal(
      new BN(vaultAAfter.amount.toString())
        .sub(new BN(vaultABefore.amount.toString()))
        .toString(),
      SWAP_AMOUNT.toString(),
      "Vault A balance incorrect"
    );

    console.log("✓ Swap A to B successful");
    console.log("Actual output:", actualAmountOut.toString());
    console.log("User Token A:", userAccountAAfter.amount.toString());
    console.log("User Token B:", userAccountBAfter.amount.toString());
  });

  it("Swaps token B for token A", async () => {
    // Get balances before swap
    const userAccountABefore = await getAccount(
      provider.connection,
      userTokenAccountA
    );
    const userAccountBBefore = await getAccount(
      provider.connection,
      userTokenAccountB
    );
    const vaultABefore = await getAccount(provider.connection, vaultAPda);
    const vaultBBefore = await getAccount(provider.connection, vaultBPda);

    // Calculate expected output
    const reserveA = new BN(vaultABefore.amount.toString());
    const reserveB = new BN(vaultBBefore.amount.toString());
    const amountIn = SWAP_AMOUNT;

    const expectedAmountOut = amountIn
      .mul(reserveA)
      .div(reserveB.add(amountIn));

    const minimumAmountOut = expectedAmountOut.mul(new BN(90)).div(new BN(100)); // 10% slippage tolerance

    console.log("Swapping", SWAP_AMOUNT.toString(), "token B for token A");
    console.log("Expected output:", expectedAmountOut.toString());
    console.log("Minimum output:", minimumAmountOut.toString());

    const tx = await program.methods
      .swap(SWAP_AMOUNT, minimumAmountOut, false) // false = B to A
      .accounts({
        user: user.publicKey,
        pool: poolPda,
        mintA: mintA,
        mintB: mintB,
        userTokenA: userTokenAccountA,
        userTokenB: userTokenAccountB,
        vaultA: vaultAPda,
        vaultB: vaultBPda,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
      })
      .signers([user])
      .rpc();

    console.log("Swap Transaction:", tx);

    // Get balances after swap
    const userAccountAAfter = await getAccount(
      provider.connection,
      userTokenAccountA
    );
    const userAccountBAfter = await getAccount(
      provider.connection,
      userTokenAccountB
    );

    // Verify token B was taken from user
    assert.equal(
      new BN(userAccountBBefore.amount.toString())
        .sub(new BN(userAccountBAfter.amount.toString()))
        .toString(),
      SWAP_AMOUNT.toString(),
      "Token B not deducted correctly"
    );

    // Verify token A was given to user
    const actualAmountOut = new BN(userAccountAAfter.amount.toString()).sub(
      new BN(userAccountABefore.amount.toString())
    );

    assert.isTrue(
      actualAmountOut.gte(minimumAmountOut),
      "Output amount less than minimum"
    );

    console.log("✓ Swap B to A successful");
    console.log("Actual output:", actualAmountOut.toString());
    console.log("User Token A:", userAccountAAfter.amount.toString());
    console.log("User Token B:", userAccountBAfter.amount.toString());
  });

  it("Fails swap with insufficient slippage tolerance", async () => {
    const vaultABefore = await getAccount(provider.connection, vaultAPda);
    const vaultBBefore = await getAccount(provider.connection, vaultBPda);

    const reserveA = new BN(vaultABefore.amount.toString());
    const reserveB = new BN(vaultBBefore.amount.toString());
    const amountIn = SWAP_AMOUNT;

    const expectedAmountOut = amountIn
      .mul(reserveB)
      .div(reserveA.add(amountIn));

    // Set minimum to more than expected (will fail)
    const minimumAmountOut = expectedAmountOut
      .mul(new BN(200))
      .div(new BN(100));

    console.log("Testing slippage protection...");
    console.log("Expected output:", expectedAmountOut.toString());
    console.log("Unrealistic minimum:", minimumAmountOut.toString());

    try {
      await program.methods
        .swap(SWAP_AMOUNT, minimumAmountOut, true)
        .accounts({
          user: user.publicKey,
          pool: poolPda,
          mintA: mintA,
          mintB: mintB,
          userTokenA: userTokenAccountA,
          userTokenB: userTokenAccountB,
          vaultA: vaultAPda,
          vaultB: vaultBPda,
          tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        })
        .signers([user])
        .rpc();

      assert.fail("Transaction should have failed");
    } catch (err: any) {
      // Check for the custom error
      const errorMessage = err.message || err.toString();
      assert.isTrue(
        errorMessage.includes("SlippageTooHigh") ||
          errorMessage.includes("6000"),
        `Expected SlippageTooHigh error but got: ${errorMessage}`
      );
      console.log("✓ Slippage protection working correctly");
    }
  });

  it("Adds more liquidity", async () => {
    const additionalLiquidityA = new BN(50_000_000);
    const additionalLiquidityB = new BN(100_000_000);

    const vaultABefore = await getAccount(provider.connection, vaultAPda);
    const vaultBBefore = await getAccount(provider.connection, vaultBPda);

    await program.methods
      .addLiquidity(additionalLiquidityA, additionalLiquidityB)
      .accounts({
        user: user.publicKey,
        pool: poolPda,
        mintA: mintA,
        mintB: mintB,
        userTokenA: userTokenAccountA,
        userTokenB: userTokenAccountB,
        vaultA: vaultAPda,
        vaultB: vaultBPda,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
      })
      .signers([user])
      .rpc();

    const vaultAAfter = await getAccount(provider.connection, vaultAPda);
    const vaultBAfter = await getAccount(provider.connection, vaultBPda);

    assert.equal(
      new BN(vaultAAfter.amount.toString())
        .sub(new BN(vaultABefore.amount.toString()))
        .toString(),
      additionalLiquidityA.toString(),
      "Additional liquidity A not added"
    );

    assert.equal(
      new BN(vaultBAfter.amount.toString())
        .sub(new BN(vaultBBefore.amount.toString()))
        .toString(),
      additionalLiquidityB.toString(),
      "Additional liquidity B not added"
    );

    console.log("✓ Additional liquidity added successfully");
    console.log("Total Vault A:", vaultAAfter.amount.toString());
    console.log("Total Vault B:", vaultBAfter.amount.toString());
  });
});
