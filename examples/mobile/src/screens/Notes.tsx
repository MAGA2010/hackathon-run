import React from 'react';
import { View, Text, TextInput, Pressable, FlatList, StyleSheet } from 'react-native';
import type { Note } from '../api';

interface NotesProps {
  notes: Note[];
  onCreate: (body: string) => Promise<void>;
}

export function Notes({ notes, onCreate }: NotesProps) {
  const [draft, setDraft] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  return (
    <View style={styles.root}>
      <Text style={styles.title}>Your notes</Text>
      <TextInput
        accessibilityLabel="note-body"
        multiline
        value={draft}
        onChangeText={setDraft}
        style={styles.input}
      />
      <Pressable
        disabled={busy || draft.length === 0}
        style={[styles.button, (busy || draft.length === 0) && styles.buttonDisabled]}
        onPress={async () => {
          setBusy(true);
          try {
            await onCreate(draft);
            setDraft('');
          } finally {
            setBusy(false);
          }
        }}
      >
        <Text style={styles.buttonText}>{busy ? 'Saving…' : 'Save note'}</Text>
      </Pressable>
      <FlatList
        style={styles.list}
        data={notes}
        keyExtractor={(n) => n.id}
        renderItem={({ item }) => (
          <View style={styles.note}>
            <Text>{item.body}</Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 16 },
  title: { fontSize: 20, marginBottom: 12 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 6, padding: 10, minHeight: 80 },
  button: {
    backgroundColor: '#0b66ff',
    padding: 12,
    borderRadius: 6,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontWeight: '600' },
  list: { marginTop: 16 },
  note: { padding: 10, borderBottomWidth: 1, borderColor: '#eee' },
});
