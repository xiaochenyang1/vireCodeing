import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { AuthField } from '../../components/AuthField';
import { styles } from '../../styles';

export function ChangeRequestForm({
  onSubmit,
}: {
  onSubmit: (description: string) => void;
}) {
  const [description, setDescription] = useState('');
  const [notice, setNotice] = useState('');

  const submit = () => {
    const trimmedDescription = description.trim();

    if (!trimmedDescription) {
      setNotice('请填写修改说明后再提交');
      return;
    }

    onSubmit(trimmedDescription);
  };

  return (
    <View style={styles.detailCard}>
      <Text style={styles.draftSectionTitle}>修改申请</Text>
      <Text style={styles.detailMeta}>
        司机已接单后不能直接改订单，本地演示将提交给客服确认。
      </Text>
      <AuthField
        testID="change-request-description"
        label="修改说明"
        placeholder="请写明要修改的地址、时间、货物或备注"
        value={description}
        onChangeText={setDescription}
        multiline
        numberOfLines={4}
      />
      {notice ? <Text style={styles.draftNotice}>{notice}</Text> : null}
      <Pressable
        testID="change-request-submit"
        style={({ pressed }) => [
          styles.detailPrimaryButton,
          pressed && styles.pressedButton,
        ]}
        onPress={submit}
      >
        <Text style={styles.detailPrimaryButtonText}>提交修改申请</Text>
      </Pressable>
    </View>
  );
}
