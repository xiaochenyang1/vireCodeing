import { StyleSheet, type ViewStyle, type TextStyle } from 'react-native';

export const colors = {
  background: '#F3F6F4',
  surface: '#FFFFFF',
  surfaceMuted: '#F8FAF8',
  text: '#16211C',
  textSecondary: '#52615A',
  textMuted: '#7B8A83',
  border: '#DDE6E1',
  teal: '#0E6F5C',
  tealDark: '#094A3E',
  tealSoft: '#DDF1EC',
  amber: '#D97904',
  amberSoft: '#FFF2DC',
  blueSoft: '#E4F0FF',
  overlay: 'rgba(10, 18, 14, 0.86)',
};

const shadows = {
  shadowColor: '#17372E',
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.08,
  shadowRadius: 18,
  elevation: 3,
};

export { shadows };

// ── Card base patterns ──────────────────────────────────────────────
const cardBase: ViewStyle = {
  borderRadius: 8,
  backgroundColor: colors.surface,
  borderWidth: 1,
  borderColor: colors.border,
  ...shadows,
};

const cardPadding: ViewStyle = { padding: 16 };
const cardPaddingCompact: ViewStyle = { padding: 14 };

const cardWithGap: ViewStyle = {
  ...cardBase,
  padding: 16,
  gap: 12,
};

const cardWithGapCompact: ViewStyle = {
  ...cardBase,
  padding: 14,
  gap: 12,
};

const cardWithGapSmall: ViewStyle = {
  ...cardBase,
  padding: 12,
  gap: 10,
};

// ── Button base patterns ────────────────────────────────────────────
const buttonBase: ViewStyle = {
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 8,
};

const primaryButton: ViewStyle = {
  ...buttonBase,
  minHeight: 48,
  backgroundColor: colors.tealDark,
};

const secondaryButton: ViewStyle = {
  ...buttonBase,
  minHeight: 40,
  backgroundColor: colors.surfaceMuted,
  borderWidth: 1,
  borderColor: colors.border,
};

const secondaryButtonText: TextStyle = {
  color: colors.textSecondary,
  fontSize: 13,
  fontWeight: '900',
};

const pressedOverlay: ViewStyle = { opacity: 0.82 };

// ── Pill base pattern ───────────────────────────────────────────────
const pillBase: ViewStyle = {
  minHeight: 28,
  justifyContent: 'center',
  borderRadius: 8,
  paddingHorizontal: 10,
};

// ── Row layout base patterns ────────────────────────────────────────
const spaceBetweenRow: ViewStyle = {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
};

// ── Content padding base patterns ───────────────────────────────────
const screenContent: ViewStyle = {
  paddingHorizontal: 16,
  paddingTop: 12,
  paddingBottom: 32,
};

const screenContentWithGap14: ViewStyle = {
  ...screenContent,
  gap: 14,
};

const screenContentWithGap16: ViewStyle = {
  ...screenContent,
  gap: 16,
};

export const styles = StyleSheet.create({
  // ── Screen wrappers ───────────────────────────────────────────────
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  authScreen: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // ── Auth ─────────────────────────────────────────────────────────
  authContent: {
    flexGrow: 1,
    ...screenContentWithGap16,
    justifyContent: 'center',
  },
  authHero: { gap: 8 },
  authKicker: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  authTitle: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '900',
  },
  authDescription: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  authCard: {
    ...cardBase,
    ...cardPadding,
  },
  authTabRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  authTabButton: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
  },
  authTabButtonActive: {
    backgroundColor: colors.tealDark,
    borderColor: colors.tealDark,
  },
  authTabText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '800',
  },
  authTabTextActive: {
    color: colors.surface,
  },
  authForm: { gap: 12 },
  authField: { gap: 6 },
  authLabel: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '800',
  },
  authInput: {
    minHeight: 46,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    color: colors.text,
    paddingHorizontal: 12,
    fontSize: 15,
  },
  authMultilineInput: {
    minHeight: 96,
    paddingTop: 12,
    textAlignVertical: 'top',
  },
  authInlineRow: {
    flexDirection: 'row',
    gap: 8,
  },
  authInlineInput: { flex: 1 },
  authInlineButton: {
    minWidth: 100,
    minHeight: 46,
    ...buttonBase,
    backgroundColor: colors.tealSoft,
    paddingHorizontal: 12,
  },
  authInlineButtonText: {
    color: colors.tealDark,
    fontSize: 13,
    fontWeight: '800',
  },
  authNotice: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  authAgreementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  authCheckbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  authCheckboxActive: {
    backgroundColor: colors.tealDark,
    borderColor: colors.tealDark,
  },
  authCheckboxMark: {
    color: colors.surface,
    fontSize: 11,
    fontWeight: '900',
  },
  authAgreementText: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  primaryButton,
  authPrimaryButton: primaryButton,
  authPrimaryButtonText: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: '900',
  },

  // ── Content padding ───────────────────────────────────────────────
  content: {
    ...screenContentWithGap16,
  },
  draftContent: {
    ...screenContent,
    gap: 14,
  },

  // ── Draft ────────────────────────────────────────────────────────
  draftTopBar: {
    ...spaceBetweenRow,
    minHeight: 56,
    gap: 12,
  },
  draftBackButton: {
    minHeight: 40,
    minWidth: 76,
    ...buttonBase,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
  },
  draftBackText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '800',
  },
  draftTitleGroup: { flex: 1 },
  draftKicker: {
    color: colors.textMuted,
    fontSize: 12,
  },
  draftTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
  },
  draftBadge: {
    minHeight: 28,
    ...buttonBase,
    backgroundColor: colors.amberSoft,
    paddingHorizontal: 10,
  },
  draftBadgeText: {
    color: colors.amber,
    fontSize: 12,
    fontWeight: '800',
  },
  draftStepper: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  draftStep: {
    minHeight: 34,
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    ...buttonBase,
    paddingHorizontal: 10,
  },
  draftStepActive: {
    backgroundColor: colors.tealSoft,
    borderColor: colors.tealSoft,
  },
  draftStepText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '800',
  },
  draftStepTextActive: {
    color: colors.tealDark,
  },
  draftCard: cardWithGap,
  draftSectionTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '900',
  },
  draftChoiceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  draftChoiceButton: {
    minHeight: 38,
    borderRadius: 8,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    ...buttonBase,
    paddingHorizontal: 12,
  },
  draftChoiceButtonActive: {
    backgroundColor: colors.tealDark,
    borderColor: colors.tealDark,
  },
  draftChoiceText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '800',
  },
  draftChoiceTextActive: {
    color: colors.surface,
  },
  draftNotice: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  draftInlineSection: { gap: 8 },
  draftFieldLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  draftPrefillNotice: {
    borderRadius: 8,
    backgroundColor: colors.tealSoft,
    borderWidth: 1,
    borderColor: colors.tealSoft,
    padding: 12,
  },
  draftPrefillNoticeText: {
    color: colors.tealDark,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 18,
  },
  draftPrefillNoticeAction: {
    marginTop: 10,
  },
  draftPrimaryButton: primaryButton,
  draftPrimaryButtonText: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: '900',
  },
  draftSecondaryButton: secondaryButton,
  draftSecondaryButtonText: secondaryButtonText,

  // ── Detail ───────────────────────────────────────────────────────
  detailContent: screenContentWithGap14,
  detailTopBar: {
    ...spaceBetweenRow,
    minHeight: 56,
    gap: 12,
  },
  detailTitleGroup: { flex: 1 },
  detailTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  detailCard: {
    ...cardBase,
    padding: 16,
    gap: 12,
  },
  detailRoute: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
    lineHeight: 22,
  },
  detailMeta: {
    color: colors.textMuted,
    fontSize: 12,
  },
  detailInlineGroup: {
    gap: 10,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  detailTimeline: { gap: 10 },
  detailTimelineItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  detailTimelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.border,
  },
  detailTimelineDotActive: {
    backgroundColor: colors.tealDark,
  },
  detailTimelineText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
  },
  detailTimelineTextActive: {
    color: colors.text,
  },
  detailGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  detailInfoCard: {
    ...cardBase,
    padding: 14,
    gap: 6,
    flex: 1,
  },
  detailInfoLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  detailInfoValue: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '900',
    lineHeight: 20,
  },
  detailInfoHint: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  detailPrimaryButton: primaryButton,
  detailPrimaryButtonText: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: '900',
  },
  detailSecondaryButton: secondaryButton,
  detailSecondaryButtonText: secondaryButtonText,
  detailNoticeCard: {
    borderRadius: 8,
    backgroundColor: colors.amberSoft,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.amberSoft,
  },
  detailNoticeText: {
    color: colors.amber,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 18,
  },

  // ── Driver ───────────────────────────────────────────────────────
  driverInfoCard: {
    ...cardBase,
    backgroundColor: colors.surfaceMuted,
    padding: 12,
    gap: 10,
  },
  driverInfoHeader: {
    ...spaceBetweenRow,
    gap: 10,
  },
  driverName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '900',
  },
  driverMeta: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  driverRatingPill: {
    ...pillBase,
    backgroundColor: colors.tealSoft,
  },
  driverRatingText: {
    color: colors.tealDark,
    fontSize: 12,
    fontWeight: '900',
  },
  driverInfoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  driverQuoteCard: {
    ...cardWithGapCompact,
  },
  driverQuoteFooter: {
    ...spaceBetweenRow,
    gap: 12,
    alignItems: 'flex-end',
  },
  driverQuoteTextGroup: {
    flex: 1,
    gap: 2,
  },
  driverQuotePrice: {
    color: colors.amber,
    fontSize: 18,
    fontWeight: '900',
  },
  driverQuoteButton: {
    minHeight: 40,
    ...buttonBase,
    backgroundColor: colors.tealDark,
    paddingHorizontal: 12,
  },
  driverQuoteButtonText: {
    color: colors.surface,
    fontSize: 13,
    fontWeight: '900',
  },

  // ── Orders ───────────────────────────────────────────────────────
  ordersContent: screenContentWithGap14,
  ordersTopBar: {
    ...spaceBetweenRow,
    minHeight: 56,
    gap: 12,
  },
  ordersTitleGroup: { flex: 1 },
  ordersTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  ordersTabs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  ordersTab: {
    minHeight: 36,
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    ...buttonBase,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ordersTabActive: {
    backgroundColor: colors.tealDark,
    borderColor: colors.tealDark,
  },
  ordersTabText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '800',
  },
  ordersTabTextActive: {
    color: colors.surface,
  },
  ordersSearchInput: {
    minHeight: 46,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  ordersEmptyState: {
    ...cardWithGapSmall,
  },
  ordersEmptyTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  ordersEmptyText: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },

  // ── Shared top bar / title / section ─────────────────────────────
  topBar: {
    ...spaceBetweenRow,
    minHeight: 56,
    gap: 12,
  },
  cityPill: {
    minHeight: 40,
    minWidth: 56,
    ...buttonBase,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cityText: {
    color: colors.tealDark,
    fontSize: 15,
    fontWeight: '700',
  },
  topTitleGroup: { flex: 1 },
  pageKicker: {
    color: colors.textMuted,
    fontSize: 12,
  },
  pageTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
  },
  topActions: {
    flexDirection: 'row',
    gap: 8,
  },
  iconButton: {
    minHeight: 40,
    minWidth: 44,
    ...buttonBase,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  iconButtonText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    ...buttonBase,
    backgroundColor: colors.amber,
    paddingHorizontal: 4,
  },
  badgeText: {
    color: colors.surface,
    fontSize: 10,
    fontWeight: '800',
  },
  verificationPanel: {
    padding: 16,
    borderRadius: 8,
    backgroundColor: colors.tealDark,
    ...shadows,
  },
  panelHeader: {
    ...spaceBetweenRow,
    gap: 12,
  },
  greeting: {
    color: colors.surface,
    fontSize: 20,
    fontWeight: '800',
  },
  profileIdentityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    gap: 12,
  },
  profileAvatar: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.tealSoft,
    overflow: 'hidden',
  },
  profileAvatarImage: {
    width: '100%',
    height: '100%',
  },
  profileAvatarText: {
    color: colors.tealDark,
    fontWeight: '800',
  },
  profileBadgeColumn: {
    alignItems: 'flex-end',
    gap: 8,
  },
  subtleText: {
    marginTop: 6,
    color: '#C7DDD5',
    fontSize: 13,
    lineHeight: 18,
  },
  verifiedBadge: {
    ...pillBase,
    backgroundColor: colors.tealSoft,
  },
  verifiedBadgeText: {
    color: colors.tealDark,
    fontSize: 12,
    fontWeight: '800',
  },
  metricRow: {
    marginTop: 18,
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.16)',
    paddingTop: 14,
  },
  metricItem: { flex: 1 },
  metricValue: {
    color: colors.surface,
    fontSize: 17,
    fontWeight: '800',
  },
  metricLabel: {
    marginTop: 4,
    color: '#B9D3CA',
    fontSize: 12,
  },
  primaryPanel: {
    ...cardBase,
    ...cardPadding,
    ...spaceBetweenRow,
    gap: 14,
  },
  primaryTextGroup: { flex: 1 },
  primaryTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '900',
  },
  primaryDescription: {
    marginTop: 6,
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  primaryMeta: {
    marginTop: 8,
    color: colors.amber,
    fontSize: 12,
    fontWeight: '800',
  },
  primaryButtonText: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: '900',
  },
  pressedButton: pressedOverlay,
  section: { gap: 10 },
  sectionHeader: {
    ...spaceBetweenRow,
    minHeight: 34,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  sectionAction: {
    color: colors.teal,
    fontSize: 13,
    fontWeight: '800',
  },
  statusGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statusCard: {
    ...cardBase,
    ...cardPaddingCompact,
    width: '48.5%',
    minHeight: 112,
    justifyContent: 'space-between',
  },
  pressedCard: pressedOverlay,
  statusCount: {
    color: colors.tealDark,
    fontSize: 26,
    fontWeight: '900',
  },
  statusLabel: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  statusDescription: {
    color: colors.textMuted,
    fontSize: 12,
  },
  routeList: { gap: 10 },
  routeCard: {
    ...cardBase,
    ...cardPaddingCompact,
  },
  routeHeader: {
    ...spaceBetweenRow,
    gap: 12,
  },
  routeName: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    fontWeight: '900',
    lineHeight: 21,
  },
  routeAction: {
    color: colors.amber,
    fontSize: 12,
    fontWeight: '800',
  },
  messageActionGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 8,
  },
  messageFilterSection: {
    marginTop: 12,
    gap: 12,
  },
  messageFilterLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '800',
  },
  messageFilterSummary: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  messageHeaderMeta: {
    alignItems: 'flex-end',
    gap: 4,
  },
  messageCategoryText: {
    color: colors.tealDark,
    fontSize: 12,
    fontWeight: '800',
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  routeAddress: {
    marginTop: 8,
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  routeMeta: {
    marginTop: 10,
    color: colors.textMuted,
    fontSize: 12,
  },
  orderList: { gap: 10 },
  orderCard: {
    ...cardBase,
    ...cardPaddingCompact,
  },
  orderTopRow: {
    ...spaceBetweenRow,
    gap: 10,
  },
  statusPill: {
    ...pillBase,
    backgroundColor: colors.blueSoft,
  },
  statusPillText: {
    color: colors.tealDark,
    fontSize: 12,
    fontWeight: '900',
  },
  orderId: {
    flex: 1,
    color: colors.textMuted,
    fontSize: 12,
    textAlign: 'right',
  },
  orderRoute: {
    marginTop: 12,
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
    lineHeight: 22,
  },
  orderMetaRow: {
    marginTop: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  orderMetaText: {
    color: colors.textSecondary,
    fontSize: 12,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  orderExceptionSummary: {
    marginTop: 12,
    gap: 4,
    borderRadius: 8,
    backgroundColor: colors.amberSoft,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  orderExceptionSummaryTitle: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '800',
  },
  orderExceptionSummaryText: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  orderBottomRow: {
    marginTop: 14,
    ...spaceBetweenRow,
    gap: 12,
    alignItems: 'flex-end',
  },
  orderPrice: {
    color: colors.amber,
    fontSize: 18,
    fontWeight: '900',
  },
  orderTime: {
    marginTop: 4,
    color: colors.textMuted,
    fontSize: 12,
  },
  secondaryButton,
  secondaryButtonText,
  detailTopBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chatBubbleContainer: {
    gap: 12,
  },
  chatBubbleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  chatBubbleRowUnread: {
    backgroundColor: '#FFF8E1',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    marginHorizontal: -8,
  },
  chatAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.tealDark,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chatAvatarText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
  chatBubble: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    borderBottomLeftRadius: 4,
  },
  chatBubbleUnread: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E3F2FD',
  },
  chatBubbleRead: {
    backgroundColor: '#F5F5F5',
  },
  chatBubbleTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  chatBubbleContent: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
  },
  chatBubbleTime: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 6,
  },
  conversationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  conversationAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.tealDark,
    justifyContent: 'center',
    alignItems: 'center',
  },
  conversationAvatarText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '700',
  },
  conversationBody: {
    flex: 1,
    gap: 4,
  },
  conversationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  conversationTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  conversationTitleUnread: {
    fontWeight: '800',
    color: colors.tealDark,
  },
  conversationTime: {
    fontSize: 12,
    color: colors.textMuted,
  },
  conversationPreview: {
    fontSize: 13,
    color: colors.textMuted,
  },
  conversationUnreadBadge: {
    backgroundColor: colors.tealDark,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  conversationUnreadText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '700',
  },
});
