import { ethers } from 'ethers';
import { useEffect, useRef, useState } from 'react';
import getProof from 'web3-proof';
import useEthers from './useEthers';

import { abi as bridgeAbi } from '../../contracts/artifacts/contracts/OracleBridge.sol/OracleBridge.json';
import { abi as wrapperAbi } from '../../contracts/artifacts/contracts/lib/ERC20Wrapper.sol/ERC20Wrapper.json';

const useBridge = props => {
  const [state = {}, setState] = useState();

  const eth = useEthers(props);

  const bridge = new useRef();
  const wrapper = new useRef();

  useEffect(() => {
    if (eth.ready) {
      bridge.current = new ethers.Contract(
        props.contractAddress,
        bridgeAbi,
        eth.wallet.current
      );
      (async () => {
        const [peer, wrapperAddress] = await Promise.all([
          bridge.current.peer(),
          bridge.current.wrapper()
        ]);
        wrapper.current = new ethers.Contract(
          wrapperAddress,
          wrapperAbi,
          eth.wallet.current
        );
        setState(p => ({ ...p, peer, wrapperAddress }));
        getLatestCheckpoint();
        getTokenBalance(eth.signer);
      })();
    }
  }, [eth.ready]);

  async function getCheckpoint(_height) {
    const height = _height || state.latestCheckpoint;
    const hash = await bridge.current.checkpoints(height);
    setState(p => ({
      ...p,
      checkpoints: {
        ...p.checkpoints,
        [height]: hash
      }
    }));
  }

  async function getLatestCheckpoint() {
    const latestCheckpoint = await bridge.current.latestCheckpoint();
    setState(p => ({ ...p, latestCheckpoint }));
    getCheckpoint(latestCheckpoint);
  }

  async function getTokenBalance(account) {
    const balance = (await wrapper.current.balanceOf(account)).toNumber();
    setState(p => ({
      ...p,
      wrapperBalances: {
        ...p.wrapperBalances,
        [account]: balance
      }
    }));
  }

  async function createCheckpoint(_height, _hash) {
    const height = _height || (await eth.provider.current.getBlockNumber());
    const hash = _hash || (await eth.provider.current.getBlock(height)).hash;
    await (await bridge.current.createCheckpoint(height, hash)).wait();
    getLatestCheckpoint();
    eth.getBlockNumber();
  }

  async function deposit(value) {
    if (!parseInt(value)) {
      alert('Bad value');
      return;
    }
    const depositTx = await (
      await bridge.current.deposit(eth.signer, { value })
    ).wait();
    // now get the proof of the deposit...
    const {
      actionType,
      amount,
      id,
      nonce,
      receiver
    } = depositTx.events[0].args;

    // save the action...
    setState(p => ({
      ...p,
      actions: {
        ...p.actions,
        [id]: { actionType, amount, id, nonce, receiver }
      }
    }));

    eth.getBlockNumber();
  }

  async function generateProof(actionId, proofBlockNumber) {
    // generate and verify the proof
    const depositProof = await getProof(
      bridge.current.address,
      actionId,
      proofBlockNumber,
      eth.provider.current
    );

    console.log(depositProof);
    // save the proof...
    setState(p => ({
      ...p,
      actions: {
        ...p.actions,
        [actionId]: {
          ...p.actions[actionId],
          ...depositProof
        }
      }
    }));
  }

  async function mint(proof) {
    const tx = await bridge.current.mint(
      proof.receiver,
      [
        proof.block.number,
        proof.amount.hex,
        proof.nonce.hex,
        proof.actionType.hex
      ],
      [proof.blockHeaderRLP, proof.accountProofRLP, proof.storageProofsRLP[0]],
      { gasLimit: 3000000 }
    );
    console.log(await tx.wait());
    await getTokenBalance(proof.receiver);
  }

  async function burn(value) {
    if (!parseInt(value)) {
      alert('Bad value');
      return;
    }
    const burnTx = await (await bridge.current.burn(eth.signer, value)).wait();
    console.log(burnTx);
    // now get the proof of the burn...
    const { actionType, amount, id, nonce, receiver } = burnTx.events[1].args;
    // save the action...
    setState(p => ({
      ...p,
      actions: {
        ...p.actions,
        [id]: { actionType, amount, id, nonce, receiver }
      }
    }));

    await eth.getBlockNumber();
    await getTokenBalance(eth.signer);
  }

  async function redeem(proof) {
    const tx = await bridge.current.redeem(
      proof.receiver,
      [
        proof.block.number,
        proof.amount.hex,
        proof.nonce.hex,
        proof.actionType.hex
      ],
      [proof.blockHeaderRLP, proof.accountProofRLP, proof.storageProofsRLP[0]],
      { gasLimit: 3000000 }
    );
    console.log(await tx.wait());
    // TODO
    // await eth.getBalance(proof.receiver);
  }

  return {
    ...props,
    ...eth,
    ...state,
    getLatestCheckpoint,
    createCheckpoint,
    deposit,
    generateProof,
    mint,
    burn,
    redeem
  };
};

export default useBridge;
