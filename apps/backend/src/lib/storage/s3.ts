import type { PutMeta, PutResult, Storage } from "./index";

// Stubbed S3 driver — wire up @aws-sdk/client-s3 when production storage is
// needed. Reads S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY,
// S3_ENDPOINT from the environment (add them to config.ts at that point).
export class S3Storage implements Storage {
  async put(_key: string, _data: Buffer, _meta: PutMeta): Promise<PutResult> {
    throw new Error("S3Storage.put not implemented — wire up @aws-sdk/client-s3 before enabling.");
  }

  async delete(_path: string): Promise<void> {
    throw new Error("S3Storage.delete not implemented.");
  }
}
