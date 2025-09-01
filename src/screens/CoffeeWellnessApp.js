import React, { useState } from 'react';
import AvatarSelectionScreen from './AvatarSelectionScreen';
import HeygenAvatarScreen from './HeygenAvatarScreen';
import ChatAvatarScreen from './ChatAvatarScreen';

export default function CoffeeWellnessApp() {
  const [selectedAvatar, setSelectedAvatar] = useState(null);
  const [interactionMode, setInteractionMode] = useState(null); // 'direct' or 'chat'

  const handleSelectAvatar = (avatar, mode) => {
    console.log('Selected avatar:', avatar, 'Mode:', mode);
    setSelectedAvatar(avatar);
    setInteractionMode(mode);
  };

  const handleBackToSelection = () => {
    setSelectedAvatar(null);
    setInteractionMode(null);
  };

  const handleChatSessionComplete = (sessionData) => {
    console.log('Chat session completed:', sessionData);
    // You could save session data, show analytics, etc.
    // For now, we'll just stay in the completed state
  };

  if (!selectedAvatar) {
    return (
      <AvatarSelectionScreen 
        onSelectAvatar={handleSelectAvatar} 
      />
    );
  }

  if (interactionMode === 'chat') {
    return (
      <ChatAvatarScreen 
        selectedAvatar={selectedAvatar}
        onBack={handleBackToSelection}
        onSessionComplete={handleChatSessionComplete}
      />
    );
  }

  return (
    <HeygenAvatarScreen 
      selectedAvatar={selectedAvatar}
      onBack={handleBackToSelection}
    />
  );
}