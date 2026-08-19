import React from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';

interface LoginProps {
  onSignIn: (email: string, password: string) => Promise<void>;
}

export function Login({ onSignIn }: LoginProps) {
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  return (
    <View style={styles.root}>
      <Text style={styles.title}>Sign in</Text>
      <TextInput
        accessibilityLabel="email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
        style={styles.input}
      />
      <TextInput
        accessibilityLabel="password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        style={styles.input}
      />
      <Pressable
        disabled={busy}
        style={[styles.button, busy && styles.buttonDisabled]}
        onPress={async () => {
          setBusy(true);
          try {
            await onSignIn(email, password);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Text style={styles.buttonText}>{busy ? 'Signing in…' : 'Sign in'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 24, justifyContent: 'center' },
  title: { fontSize: 24, marginBottom: 24, textAlign: 'center' },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 6, padding: 12, marginBottom: 12 },
  button: { backgroundColor: '#0b66ff', padding: 14, borderRadius: 6, alignItems: 'center' },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontWeight: '600' },
});
