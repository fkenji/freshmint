// @ts-ignore
import * as fcl from '@onflow/fcl';
// @ts-ignore
import * as t from '@onflow/types';

import NFTContract from './NFTContract';
import { MetadataMap } from '../metadata';
import { EditionNFTGenerator } from '../generators/EditionNFTGenerator';
import { FreshmintConfig, ContractImports } from '../config';
import { Transaction, TransactionResult, TransactionEvent } from '../transactions';
import { PublicKey, SignatureAlgorithm, HashAlgorithm } from '../crypto';
import { Script } from '../scripts';

export type EditionInput = {
  size: number;
  metadata: MetadataMap;
};

export type EditionNFTInput = {
  editionId: string;
  count: number;
};

export type EditionResult = {
  id: string;
  metadata: MetadataMap;
  size: number;
};

export type OnChainEdition = {
  id: string;
  size: number;
  count: number;
  metadata: { [key: string]: any };
};

export type NFTMintResult = {
  id: string;
  editionId: string;
  editionSerial: string;
  transactionId: string;
};

export class EditionNFTContract extends NFTContract {
  getSource(imports: ContractImports, options?: { saveAdminResourceToContractAccount?: boolean }): string {
    return EditionNFTGenerator.contract({
      imports,
      contractName: this.name,
      schema: this.schema,
      saveAdminResourceToContractAccount: options?.saveAdminResourceToContractAccount,
    });
  }

  deploy(
    publicKey: PublicKey,
    hashAlgo: HashAlgorithm,
    options?: {
      saveAdminResourceToContractAccount?: boolean;
    },
  ): Transaction<string> {
    return new Transaction(
      ({ imports }: FreshmintConfig) => {
        const script = EditionNFTGenerator.deploy();

        const saveAdminResourceToContractAccount = options?.saveAdminResourceToContractAccount ?? false;

        const contractCode = this.getSource(imports, { saveAdminResourceToContractAccount });
        const contractCodeHex = Buffer.from(contractCode, 'utf-8').toString('hex');

        const sigAlgo = publicKey.signatureAlgorithm();

        return {
          script,
          args: [
            fcl.arg(this.name, t.String),
            fcl.arg(contractCodeHex, t.String),
            fcl.arg(publicKey.toHex(), t.String),
            fcl.arg(SignatureAlgorithm.toCadence(sigAlgo), t.UInt8),
            fcl.arg(HashAlgorithm.toCadence(hashAlgo), t.UInt8),
            fcl.arg(saveAdminResourceToContractAccount, t.Bool),
          ],
          computeLimit: 9999,
          signers: this.getSigners(),
        };
      },
      ({ events }: TransactionResult) => {
        const accountCreatedEvent = events.find((event: TransactionEvent) => event.type === 'flow.AccountCreated');

        const address = accountCreatedEvent?.data['address'];

        this.setAddress(address);

        return address;
      },
    );
  }

  createEdition(edition: EditionInput): Transaction<EditionResult> {
    const editions = [edition];

    return new Transaction(
      this.makeCreateEditionsTransaction(editions),
      (result: TransactionResult) => formatEditionResults(result, editions)[0],
    );
  }

  createEditions(editions: EditionInput[]): Transaction<EditionResult[]> {
    return new Transaction(this.makeCreateEditionsTransaction(editions), (result: TransactionResult) =>
      formatEditionResults(result, editions),
    );
  }

  private makeCreateEditionsTransaction(editions: EditionInput[]) {
    return ({ imports }: FreshmintConfig) => {
      const script = EditionNFTGenerator.createEditions({
        imports,
        contractName: this.name,
        // TODO: return error if contract address is not set
        contractAddress: this.address ?? '',
        schema: this.schema,
      });

      const sizes = editions.map((edition) => edition.size.toString(10));

      return {
        script,
        args: [
          fcl.arg(sizes, t.Array(t.UInt64)),
          ...this.schema.fields.map((field) => {
            return fcl.arg(
              editions.map((edition) => field.getValue(edition.metadata)),
              t.Array(field.asCadenceTypeObject()),
            );
          }),
        ],
        computeLimit: 9999,
        signers: this.getSigners(),
      };
    };
  }

  mintNFT({
    editionId,
    count,
    bucket,
  }: {
    editionId: string;
    count: number;
    bucket?: string;
  }): Transaction<NFTMintResult> {
    return new Transaction(
      this.makeMintNFTsTransaction({ editionId, count, bucket }),
      (result: TransactionResult) => formatMintResults(result, editionId)[0],
    );
  }

  mintNFTs({
    editionId,
    count,
    bucket,
  }: {
    editionId: string;
    count: number;
    bucket?: string;
  }): Transaction<NFTMintResult[]> {
    return new Transaction(this.makeMintNFTsTransaction({ editionId, count, bucket }), (result: TransactionResult) =>
      formatMintResults(result, editionId),
    );
  }

  private makeMintNFTsTransaction({ editionId, count, bucket }: { editionId: string; count: number; bucket?: string }) {
    return ({ imports }: FreshmintConfig) => {
      const script = EditionNFTGenerator.mint({
        imports,
        contractName: this.name,
        // TODO: return error if contract address is not set
        contractAddress: this.address ?? '',
      });

      return {
        script,
        args: [fcl.arg(editionId, t.UInt64), fcl.arg(count.toString(10), t.Int), fcl.arg(bucket, t.Optional(t.String))],
        computeLimit: 9999,
        signers: this.getSigners(),
      };
    };
  }

  getEdition(editionId: string): Script<OnChainEdition> {
    const script = EditionNFTGenerator.getEdition({
      contractName: this.name,
      // TODO: return error if contract address is not set
      contractAddress: this.address ?? '',
    });

    return new Script(
      () => ({
        script,
        args: (arg, t) => [arg(editionId, t.UInt64)],
        computeLimit: 9999,
      }),
      (result) => ({
        id: result.id,
        size: parseInt(result.size, 10),
        count: parseInt(result.count, 10),
        metadata: result.metadata,
      }),
    );
  }
}

function formatEditionResults({ events }: TransactionResult, editions: EditionInput[]): EditionResult[] {
  const editionEvents = events.filter((event) => event.type.includes('.EditionCreated'));

  return editions.flatMap((edition, i) => {
    const editionEvent: any = editionEvents[i];
    const editionId = editionEvent.data.edition.id;

    return {
      id: editionId,
      metadata: edition.metadata,
      size: edition.size,
    };
  });
}

function formatMintResults({ transactionId, events }: TransactionResult, editionId: string): NFTMintResult[] {
  const deposits = events.filter((event) => event.type.includes('.Minted'));

  return deposits.map((deposit) => {
    return {
      id: deposit.data.id,
      editionId,
      editionSerial: deposit.data.serialNumber,
      transactionId,
    };
  });
}
