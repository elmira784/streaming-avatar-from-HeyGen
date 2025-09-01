import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';

const avatars = [
  {
    id: 'Thaddeus_ProfessionalLook_public',
    name: 'Bora',
    color: '#4A90E2',
    gradientColors: ['#4A90E2', '#357ABD'],
    icon: '👨‍💼',
    subtitle: 'Coffee Expert'
  },
  {
    id: 'Katya_ProfessionalLook_public', 
    name: 'Parla',
    color: '#E24A90',
    gradientColors: ['#E24A90', '#C73E73'],
    icon: '👩‍🏥',
    subtitle: 'Wellness Coach'
  }
];

function AvatarCard({ avatar, onSelectAvatar, onModeSelect, selectedAvatar }) {  
  const isSelected = selectedAvatar?.id === avatar.id;
  
  if (isSelected) {
    return (
      <View style={[styles.avatarCard, { borderColor: avatar.color, borderWidth: 3 }]}>
        <View style={[styles.avatarImage, { backgroundColor: avatar.color }]}>
          <View style={styles.iconContainer}>
            <Text style={styles.avatarIcon}>{avatar.icon}</Text>
            <Text style={styles.avatarInitial}>{avatar.name.charAt(0)}</Text>
          </View>
        </View>
        <View style={[styles.avatarName, { backgroundColor: avatar.color }]}>
          <Text style={styles.nameText}>{avatar.name}</Text>
          <Text style={styles.subtitleText}>{avatar.subtitle}</Text>
        </View>
        
        {/* Mode Selection */}
        <View style={styles.modeSelection}>
          <TouchableOpacity
            style={[styles.modeButton, styles.chatModeButton]}
            onPress={() => onModeSelect(avatar, 'chat')}
          >
            <Text style={styles.modeButtonText}>💬 Chat Mode</Text>
            <Text style={styles.modeDescription}>Ask anything for 10s</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.modeButton, styles.directModeButton]}
            onPress={() => onModeSelect(avatar, 'direct')}
          >
            <Text style={styles.modeButtonText}>🎯 Direct Mode</Text>
            <Text style={styles.modeDescription}>Wellness tips</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }
  
  return (
    <TouchableOpacity
      style={[styles.avatarCard, { borderColor: avatar.color }]}
      onPress={() => onSelectAvatar(avatar)}
    >
      <View style={[styles.avatarImage, { backgroundColor: avatar.color }]}>
        <View style={styles.iconContainer}>
          <Text style={styles.avatarIcon}>{avatar.icon}</Text>
          <Text style={styles.avatarInitial}>{avatar.name.charAt(0)}</Text>
        </View>
      </View>
      <View style={[styles.avatarName, { backgroundColor: avatar.color }]}>
        <Text style={styles.nameText}>{avatar.name}</Text>
        <Text style={styles.subtitleText}>{avatar.subtitle}</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function AvatarSelectionScreen({ onSelectAvatar }) {
  const [selectedAvatar, setSelectedAvatar] = useState(null);

  const handleAvatarSelect = (avatar) => {
    setSelectedAvatar(avatar);
  };

  const handleModeSelect = (avatar, mode) => {
    onSelectAvatar(avatar, mode);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <View style={styles.headerContainer}>
        <Text style={styles.headerTitle}>Choose Your Wellness Coach</Text>
        <Text style={styles.headerSubtitle}>
          {selectedAvatar ? 'Select interaction mode:' : 'Tap an avatar to get started:'}
        </Text>
      </View>

      <View style={styles.avatarContainer}>
        {avatars.map((avatar) => (
          <AvatarCard
            key={avatar.id}
            avatar={avatar}
            onSelectAvatar={handleAvatarSelect}
            onModeSelect={handleModeSelect}
            selectedAvatar={selectedAvatar}
          />
        ))}
      </View>

      {selectedAvatar && (
        <View style={styles.instructionContainer}>
          <Text style={styles.instructionTitle}>Mode Explanations:</Text>
          <View style={styles.instructionItem}>
            <Text style={styles.instructionIcon}>💬</Text>
            <View style={styles.instructionTextContainer}>
              <Text style={styles.instructionItemTitle}>Chat Mode</Text>
              <Text style={styles.instructionItemText}>
                Ask {selectedAvatar.name} anything about wellness. They'll respond for exactly 10 seconds, then you'll see the full transcript.
              </Text>
            </View>
          </View>
          <View style={styles.instructionItem}>
            <Text style={styles.instructionIcon}>🎯</Text>
            <View style={styles.instructionTextContainer}>
              <Text style={styles.instructionItemTitle}>Direct Mode</Text>
              <Text style={styles.instructionItemText}>
                Get immediate wellness tips and Turkish coffee coaching from {selectedAvatar.name} without time limits.
              </Text>
            </View>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  scrollContent: {
    paddingVertical: 40,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  headerContainer: {
    alignItems: 'center',
    marginBottom: 30,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 10,
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#ccc',
    textAlign: 'center',
  },
  avatarContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    paddingHorizontal: 20,
    marginBottom: 30,
  },
  avatarCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 20,
    borderWidth: 2,
    overflow: 'hidden',
    width: 150,
    minHeight: 220,
  },
  avatarImage: {
    width: '100%',
    height: 160,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarIcon: {
    fontSize: 40,
    marginBottom: 10,
  },
  avatarInitial: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  avatarName: {
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 5,
  },
  nameText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  subtitleText: {
    fontSize: 12,
    color: '#fff',
    opacity: 0.9,
    marginTop: 2,
  },
  modeSelection: {
    padding: 15,
  },
  modeButton: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 8,
    alignItems: 'center',
  },
  chatModeButton: {
    borderWidth: 1,
    borderColor: '#4CAF50',
  },
  directModeButton: {
    borderWidth: 1,
    borderColor: '#2196F3',
  },
  modeButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  modeDescription: {
    color: '#ccc',
    fontSize: 10,
  },
  instructionContainer: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    padding: 20,
    borderRadius: 15,
    width: '100%',
    maxWidth: 350,
  },
  instructionTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
    textAlign: 'center',
  },
  instructionItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 15,
  },
  instructionIcon: {
    fontSize: 20,
    marginRight: 10,
    marginTop: 2,
  },
  instructionTextContainer: {
    flex: 1,
  },
  instructionItemTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  instructionItemText: {
    color: '#ccc',
    fontSize: 14,
    lineHeight: 20,
  },
});