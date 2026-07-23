import { Pressable, Text, View } from 'react-native';

import { AuthField } from '../../components/AuthField';
import { valueAddedServiceOptions } from '../../data/mockData';
import { styles } from '../../styles';
import type { ValueAddedServiceOption } from '../../types';
import type { DraftValueAddedServiceEstimate } from '../../utils/orderDraft';

export function ValueAddedServicesSection({
  valueAddedServiceIds,
  onToggleValueAddedService,
  loadingWorkerCount,
  onLoadingWorkerCountChange,
  insuredValueText,
  onInsuredValueTextChange,
  serviceEstimate,
}: {
  valueAddedServiceIds: ValueAddedServiceOption['id'][];
  onToggleValueAddedService: (serviceId: ValueAddedServiceOption['id']) => void;
  loadingWorkerCount: number;
  onLoadingWorkerCountChange: (value: number) => void;
  insuredValueText: string;
  onInsuredValueTextChange: (value: string) => void;
  serviceEstimate?: DraftValueAddedServiceEstimate;
}) {
  const guidanceText = serviceEstimate
    ? '当前会基于已选增值服务生成本地参考附加费预估，不会自动叠加到一口价。'
    : '可先记录装卸、保价和包装需求；选中后会生成本地参考附加费预估。';

  return (
    <View style={styles.draftCard}>
      <Text style={styles.draftSectionTitle}>增值服务</Text>
      <Text style={styles.draftNotice}>{guidanceText}</Text>
      <View style={styles.draftChoiceGrid}>
        {valueAddedServiceOptions.map(option => {
          const isActive = valueAddedServiceIds.includes(option.id);

          return (
            <Pressable
              key={option.id}
              testID={`draft-service-${option.id}`}
              style={[
                styles.draftChoiceButton,
                isActive && styles.draftChoiceButtonActive,
              ]}
              onPress={() => onToggleValueAddedService(option.id)}
            >
              <Text
                style={[
                  styles.draftChoiceText,
                  isActive && styles.draftChoiceTextActive,
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {valueAddedServiceIds.includes('loading') ? (
        <View style={styles.draftInlineSection}>
          <Text style={styles.draftFieldLabel}>装卸工人数</Text>
          <View style={styles.draftChoiceGrid}>
            {[1, 2, 3, 4, 5].map(workerCount => {
              const isActive = loadingWorkerCount === workerCount;

              return (
                <Pressable
                  key={workerCount}
                  testID={`draft-loading-worker-count-${workerCount}`}
                  style={[
                    styles.draftChoiceButton,
                    isActive && styles.draftChoiceButtonActive,
                  ]}
                  onPress={() => onLoadingWorkerCountChange(workerCount)}
                >
                  <Text
                    style={[
                      styles.draftChoiceText,
                      isActive && styles.draftChoiceTextActive,
                    ]}
                  >
                    {workerCount} 人
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}
      {valueAddedServiceIds.includes('insurance') ? (
        <AuthField
          label="保价货值"
          testID="draft-insured-value"
          placeholder="例如 12000"
          value={insuredValueText}
          onChangeText={onInsuredValueTextChange}
          keyboardType="number-pad"
        />
      ) : null}
      {serviceEstimate ? (
        <View style={styles.draftInlineSection}>
          <Text style={styles.draftFieldLabel}>本地参考附加费</Text>
          {serviceEstimate.lineTexts.map((lineText, index) => (
            <Text
              key={`${index}-${lineText}`}
              testID={`draft-service-estimate-line-${index}`}
              style={styles.detailMeta}
            >
              {lineText}
            </Text>
          ))}
          {serviceEstimate.totalAmountText ? (
            <Text testID="draft-service-estimate-total" style={styles.routeMeta}>
              {`参考附加费合计：${serviceEstimate.totalAmountText}`}
            </Text>
          ) : null}
          <Text style={styles.routeMeta}>{serviceEstimate.noticeText}</Text>
        </View>
      ) : null}
    </View>
  );
}
