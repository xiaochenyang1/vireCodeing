import { Text, TextInput, View } from 'react-native';

import { colors, styles } from '../styles';

type AuthFieldProps = {
  label: string;
  testID: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  keyboardType?: 'default' | 'number-pad' | 'phone-pad';
  maxLength?: number;
  secureTextEntry?: boolean;
  multiline?: boolean;
  numberOfLines?: number;
  editable?: boolean;
};

export function AuthField({
  label,
  testID,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  maxLength,
  secureTextEntry,
  multiline,
  numberOfLines,
  editable = true,
}: AuthFieldProps) {
  return (
    <View style={styles.authField}>
      <Text style={styles.authLabel}>{label}</Text>
      <TextInput
        testID={testID}
        style={[styles.authInput, multiline && styles.authMultilineInput]}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        maxLength={maxLength}
        secureTextEntry={secureTextEntry}
        multiline={multiline}
        numberOfLines={numberOfLines}
        editable={editable}
      />
    </View>
  );
}
