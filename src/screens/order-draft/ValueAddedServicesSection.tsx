import { Pressable, Text, View } from 'react-native';

import { AuthField } from '../../components/AuthField';
import { valueAddedServiceOptions } from '../../data/mockData';
import { styles } from '../../styles';
import type { ValueAddedServiceOption } from '../../types';

export function ValueAddedServicesSection({
  valueAddedServiceIds,
  onToggleValueAddedService,
  loadingWorkerCount,
  onLoadingWorkerCountChange,
  insuredValueText,
  onInsuredValueTextChange,
}: {
  valueAddedServiceIds: ValueAddedServiceOption['id'][];
  onToggleValueAddedService: (serviceId: ValueAddedServiceOption['id']) => void;
  loadingWorkerCount: number;
  onLoadingWorkerCountChange: (value: number) => void;
  insuredValueText: string;
  onInsuredValueTextChange: (value: string) => void;
}) {
  return (
    <View style={styles.draftCard}>
      <Text style={styles.draftSectionTitle}>增值服务</Text>
      <Text style={styles.draftNotice}>
        本地记录装卸、保价和包装需求，真实计费后续接入。
      </Text>
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
    </View>
  );
}
