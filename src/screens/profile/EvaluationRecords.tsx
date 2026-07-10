import { Pressable, Text, View } from 'react-native';
import { useState } from 'react';

import { styles } from '../../styles';
import {
  filterEvaluationRecords,
  type EvaluationFilter,
  type ProfileEvaluationRecordItem,
} from '../../utils/profileEvaluations';

export function EvaluationRecords({
  evaluationRecords,
}: {
  evaluationRecords: ProfileEvaluationRecordItem[];
}) {
  const [filter, setFilter] = useState<EvaluationFilter>('all');
  const filterOptions: Array<{
    id: EvaluationFilter;
    label: string;
    testID: string;
  }> = [
    { id: 'all', label: '全部', testID: 'evaluation-filter-all' },
    { id: 'high', label: '5 星', testID: 'evaluation-filter-high' },
    {
      id: 'lower',
      label: '4 星及以下',
      testID: 'evaluation-filter-lower',
    },
  ];
  const filteredRecords = filterEvaluationRecords(evaluationRecords, filter);

  return (
    <View style={styles.detailCard}>
      <Text style={styles.draftSectionTitle}>评价筛选</Text>
      <View style={styles.draftChoiceGrid}>
        {filterOptions.map(option => {
          const active = option.id === filter;

          return (
            <Pressable
              key={option.id}
              testID={option.testID}
              style={[
                styles.draftChoiceButton,
                active && styles.draftChoiceButtonActive,
              ]}
              onPress={() => setFilter(option.id)}
            >
              <Text
                style={[
                  styles.draftChoiceText,
                  active && styles.draftChoiceTextActive,
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.draftSectionTitle}>评价明细</Text>
      {filteredRecords.map(item => (
        <View key={item.id} style={styles.driverInfoCard}>
          <View style={styles.routeHeader}>
            <Text style={styles.routeName}>{item.orderId}</Text>
            <Text style={styles.routeAction}>{item.ratingText}</Text>
          </View>
          <Text style={styles.driverName}>{item.driverName}</Text>
          {item.photoText ? (
            <Text style={styles.detailMeta}>{item.photoText}</Text>
          ) : null}
          <Text style={styles.detailMeta}>{item.content}</Text>
          <Text style={styles.routeMeta}>{item.timeText}</Text>
          {item.driverReplyText ? (
            <>
              <Text style={styles.detailMeta}>
                {`司机回复：${item.driverReplyText}`}
              </Text>
              <Text style={styles.routeMeta}>
                {`回复时间：${item.driverReplyTimeText}`}
              </Text>
            </>
          ) : null}
        </View>
      ))}
    </View>
  );
}
