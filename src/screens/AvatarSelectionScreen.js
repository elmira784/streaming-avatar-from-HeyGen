import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

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

function AvatarCard({ avatar, onSelectAvatar }) {  
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
  return (
    <View style={styles.container}>
      <View style={styles.avatarContainer}>
        {avatars.map((avatar) => (
          <AvatarCard
            key={avatar.id}
            avatar={avatar}
            onSelectAvatar={onSelectAvatar}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    paddingHorizontal: 40,
  },
  avatarCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 20,
    borderWidth: 3,
    overflow: 'hidden',
    width: 150,
    height: 220,
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
});