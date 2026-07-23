import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { AuthField } from '../../components/AuthField';
import { styles } from '../../styles';

export function CancellationForm({
  onSubmit,
  usesPlatformCancellation = false,
}: {
  onSubmit: (cancellation: {
    reasonText: string;
    description: string;
  }) => void;
  usesPlatformCancellation?: boolean;
}) {
  const cancelReasonOptions = [
    { id: 'plan-change', label: '计划有变' },
    { id: 'duplicate', label: '重复下单' },
    { id: 'price', label: '价格不合适' },
    { id: 'other', label: '其他原因' },
  ];
  const [selectedReason, setSelectedReason] = useState(
    cancelReasonOptions[0],
  );
  const [description, setDescription] = useState('');
  const [notice, setNotice] = useState('');

  const submit = () => {
    if (!description.trim()) {
      setNotice('请填写取消说明后再提交');
      return;
    }

    onSubmit({
      reasonText: selectedReason.label,
      description: description.trim(),
    });
  };

  return (
    <View style={styles.detailCard}>
      <Text style={styles.draftSectionTitle}>取消原因</Text>
      <Text style={styles.detailMeta}>
        {usesPlatformCancellation
          ? '当前订单已接平台取消接口；提交后会同步平台订单状态，违约金和退款仍待客服确认。'
          : '当前为本地取消演示；提交后只记录本地取消原因、违约提示和客服审核状态。'}
      </Text>
      <View style={styles.draftChoiceGrid}>
        {cancelReasonOptions.map(option => {
          const active = option.id === selectedReason.id;

          return (
            <Pressable
              key={option.id}
              testID={`cancel-reason-${option.id}`}
              style={[
                styles.draftChoiceButton,
                active && styles.draftChoiceButtonActive,
              ]}
              onPress={() => setSelectedReason(option)}
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
      <AuthField
        testID="cancel-description"
        label="取消说明"
        placeholder="请填写取消原因，便于后续客服核对"
        value={description}
        onChangeText={setDescription}
        multiline
        numberOfLines={4}
      />
      {notice ? <Text style={styles.draftNotice}>{notice}</Text> : null}
      <Pressable
        testID="cancel-submit"
        style={({ pressed }) => [
          styles.detailPrimaryButton,
          pressed && styles.pressedButton,
        ]}
        onPress={submit}
      >
        <Text style={styles.detailPrimaryButtonText}>确认取消</Text>
      </Pressable>
    </View>
  );
}
