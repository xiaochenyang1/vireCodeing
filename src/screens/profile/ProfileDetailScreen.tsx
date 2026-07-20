import { ScrollView } from 'react-native';

import { styles } from '../../styles';
import type { RecentOrder } from '../../types';
import type { createPlatformAuthApi } from '../../services/platformAuthApi';
import type { createPlatformFileApi } from '../../services/platformFileApi';
import type {
  createPlatformProfileApi,
  PlatformProfileSpendingSnapshot,
} from '../../services/platformProfileApi';
import type { ProfileEvaluationRecordItem } from '../../utils/profileEvaluations';
import type { ProfileSectionId } from '../../utils/profileOverview';
import {
  type AddressItem,
  type ContactItem,
  type CouponItem,
  type EnterpriseVerificationRequest,
  type IdentityVerificationRequest,
  type InvoiceApplicationDetails,
  type InvoiceItem,
  type InvoiceRejectionReasons,
  type InvoiceTitleOption,
  type InvoiceTypeOption,
  type ProfileLocalState,
  type SavedAccountSettings,
  type SavedPasswordSettings,
  type SettingItem,
} from '../../utils/profileLocalState';
import { AddressRecords } from './AddressRecords';
import { ContactRecords } from './ContactRecords';
import { CouponRecords } from './CouponRecords';
import { EnterpriseVerificationRecords } from './EnterpriseVerificationRecords';
import { EvaluationRecords } from './EvaluationRecords';
import { IdentityVerificationRecords } from './IdentityVerificationRecords';
import { InvoiceRecords } from './InvoiceRecords';
import { ProfileTopBar } from './ProfileTopBar';
import { SettingRecords } from './SettingRecords';
import { SpendingRecords } from './SpendingRecords';

export type ProfilePlatformAuthApi = Pick<
  ReturnType<typeof createPlatformAuthApi>,
  'changePassword'
>;
export type ProfilePlatformProfileApi = Pick<
  ReturnType<typeof createPlatformProfileApi>,
  | 'saveAccountProfile'
  | 'saveIdentityVerification'
  | 'saveEnterpriseVerification'
  | 'getInvoices'
  | 'createInvoiceApplication'
>;
export type ProfilePlatformFileApi = Pick<
  ReturnType<typeof createPlatformFileApi>,
  'createUploadIntent' | 'confirmUploaded' | 'confirmLocalUploadTarget'
>;

type AddressInput = Omit<AddressItem, 'id'>;
type ContactInput = Omit<ContactItem, 'id'>;

export function ProfileDetailScreen({
  now,
  sectionId,
  orders,
  addresses,
  contacts,
  identityVerification,
  enterpriseVerification,
  evaluationRecords,
  coupons,
  invoices,
  invoiceDetails,
  invoiceRejectionReasons,
  invoiceType,
  invoiceTitle,
  receiverEmail,
  selectedInvoiceOrderIds,
  settings,
  account,
  password,
  platformSpendingSnapshot,
  spendingNotice,
  platformAuthApi,
  platformProfileApi,
  platformFileApi,
  onAddAddress,
  onDeleteAddress,
  onUpdateAddress,
  onAddContact,
  onDeleteContact,
  onUpdateContact,
  onSubmitIdentityVerification,
  onRejectIdentityVerification,
  onSubmitEnterpriseVerification,
  onRejectEnterpriseVerification,
  onUpdateCoupons,
  onUpdateInvoices,
  onUpdateInvoiceDetails,
  onUpdateInvoiceRejectionReasons,
  onUpdateInvoiceSelections,
  onUpdateInvoiceMeta,
  onUpdateSettings,
  onUpdateAccount,
  onUpdatePassword,
  onBackOverview,
  onLogout,
}: {
  now: number;
  sectionId: ProfileSectionId;
  orders: RecentOrder[];
  addresses: AddressItem[];
  contacts: ContactItem[];
  identityVerification?: IdentityVerificationRequest;
  enterpriseVerification?: EnterpriseVerificationRequest;
  evaluationRecords: ProfileEvaluationRecordItem[];
  coupons: CouponItem[];
  invoices: InvoiceItem[];
  invoiceDetails: Record<string, InvoiceApplicationDetails>;
  invoiceRejectionReasons: InvoiceRejectionReasons;
  invoiceType: InvoiceTypeOption;
  invoiceTitle: InvoiceTitleOption;
  receiverEmail: string;
  selectedInvoiceOrderIds: string[];
  settings: SettingItem[];
  account: SavedAccountSettings;
  password: SavedPasswordSettings;
  platformSpendingSnapshot?: PlatformProfileSpendingSnapshot;
  spendingNotice?: string;
  platformAuthApi?: ProfilePlatformAuthApi;
  platformProfileApi?: ProfilePlatformProfileApi;
  platformFileApi?: ProfilePlatformFileApi;
  onAddAddress: (address: AddressInput) => void;
  onDeleteAddress: (addressId: string) => void;
  onUpdateAddress: (addressId: string, changes: AddressInput) => void;
  onAddContact: (contact: ContactInput) => void;
  onDeleteContact: (contactId: string) => void;
  onUpdateContact: (contactId: string, changes: ContactInput) => void;
  onSubmitIdentityVerification: (request: IdentityVerificationRequest) => void;
  onRejectIdentityVerification: (reason: string) => void;
  onSubmitEnterpriseVerification: (
    request: EnterpriseVerificationRequest,
  ) => void;
  onRejectEnterpriseVerification: (reason: string) => void;
  onUpdateCoupons: (coupons: CouponItem[]) => void;
  onUpdateInvoices: (invoices: InvoiceItem[]) => void;
  onUpdateInvoiceDetails: (
    invoiceDetails: Record<string, InvoiceApplicationDetails>,
  ) => void;
  onUpdateInvoiceRejectionReasons: (
    reasons: InvoiceRejectionReasons,
  ) => void;
  onUpdateInvoiceSelections: (selectedInvoiceOrderIds: string[]) => void;
  onUpdateInvoiceMeta: (
    changes: Partial<
      Pick<
        ProfileLocalState,
        'invoiceType' | 'invoiceTitle' | 'receiverEmail'
      >
    >,
  ) => void;
  onUpdateSettings: (settings: SettingItem[]) => void;
  onUpdateAccount: (account: SavedAccountSettings) => void;
  onUpdatePassword: (password: SavedPasswordSettings) => void;
  onBackOverview: () => void;
  onLogout: () => void;
}) {
  const sectionTitleMap: Record<ProfileSectionId, string> = {
    addresses: '常用地址',
    contacts: '常用联系人',
    evaluations: '我的评价',
    spending: '消费记录',
    'identity-verification': '实名认证',
    'enterprise-verification': '企业认证',
    invoices: '发票管理',
    coupons: '优惠券',
    settings: '设置',
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.detailContent}
      showsVerticalScrollIndicator={false}
    >
      <ProfileTopBar
        title={sectionTitleMap[sectionId]}
        subtitle="个人中心"
        onBack={onBackOverview}
        backTestID="profile-back-overview"
        backText="返回个人中心"
      />

      {sectionId === 'addresses' ? (
        <AddressRecords
          addresses={addresses}
          onAddAddress={onAddAddress}
          onDeleteAddress={onDeleteAddress}
          onUpdateAddress={onUpdateAddress}
        />
      ) : null}
      {sectionId === 'contacts' ? (
        <ContactRecords
          contacts={contacts}
          onAddContact={onAddContact}
          onDeleteContact={onDeleteContact}
          onUpdateContact={onUpdateContact}
        />
      ) : null}
      {sectionId === 'evaluations' ? (
        <EvaluationRecords evaluationRecords={evaluationRecords} />
      ) : null}
      {sectionId === 'spending' ? (
        <SpendingRecords
          orders={orders}
          platformSpendingSnapshot={platformSpendingSnapshot}
          notice={spendingNotice}
        />
      ) : null}
      {sectionId === 'identity-verification' ? (
        <IdentityVerificationRecords
          verification={identityVerification}
          platformProfileApi={platformProfileApi}
          platformFileApi={platformFileApi}
          onSubmit={onSubmitIdentityVerification}
          onReject={onRejectIdentityVerification}
        />
      ) : null}
      {sectionId === 'enterprise-verification' ? (
        <EnterpriseVerificationRecords
          verification={enterpriseVerification}
          platformProfileApi={platformProfileApi}
          platformFileApi={platformFileApi}
          onSubmit={onSubmitEnterpriseVerification}
          onReject={onRejectEnterpriseVerification}
        />
      ) : null}
      {sectionId === 'invoices' ? (
        <InvoiceRecords
          now={now}
          orders={orders}
          invoices={invoices}
          invoiceDetails={invoiceDetails}
          invoiceRejectionReasons={invoiceRejectionReasons}
          enterpriseVerification={enterpriseVerification}
          invoiceType={invoiceType}
          invoiceTitle={invoiceTitle}
          receiverEmail={receiverEmail}
          selectedInvoiceOrderIds={selectedInvoiceOrderIds}
          account={account}
          platformProfileApi={platformProfileApi}
          platformSpendingSnapshot={platformSpendingSnapshot}
          onUpdateInvoices={onUpdateInvoices}
          onUpdateInvoiceDetails={onUpdateInvoiceDetails}
          onUpdateInvoiceRejectionReasons={onUpdateInvoiceRejectionReasons}
          onUpdateInvoiceSelections={onUpdateInvoiceSelections}
          onUpdateInvoiceMeta={onUpdateInvoiceMeta}
        />
      ) : null}
      {sectionId === 'coupons' ? (
        <CouponRecords coupons={coupons} onUpdateCoupons={onUpdateCoupons} />
      ) : null}
      {sectionId === 'settings' ? (
        <SettingRecords
          now={now}
          settings={settings}
          account={account}
          password={password}
          platformAuthApi={platformAuthApi}
          platformProfileApi={platformProfileApi}
          onUpdateSettings={onUpdateSettings}
          onUpdateAccount={onUpdateAccount}
          onUpdatePassword={onUpdatePassword}
          onLogout={onLogout}
        />
      ) : null}
    </ScrollView>
  );
}
