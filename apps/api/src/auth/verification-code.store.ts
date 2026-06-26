import type { VerificationPurpose } from './dto';

export type VerificationCodeRecord = {
  phone: string;
  purpose: VerificationPurpose;
  code: string;
  expiresAt: Date;
  consumedAt?: Date;
};

export class InMemoryVerificationCodeStore {
  private readonly records: VerificationCodeRecord[] = [];

  constructor(private readonly now: () => Date = () => new Date()) {}

  saveCode(record: VerificationCodeRecord): void {
    this.records.push(record);
  }

  findActiveCode(
    phone: string,
    purpose: VerificationPurpose,
  ): VerificationCodeRecord | undefined {
    const now = this.now();

    return [...this.records]
      .reverse()
      .find(
        record =>
          record.phone === phone &&
          record.purpose === purpose &&
          !record.consumedAt &&
          record.expiresAt.getTime() > now.getTime(),
      );
  }

  consumeCode(record: VerificationCodeRecord): void {
    record.consumedAt = this.now();
  }
}
