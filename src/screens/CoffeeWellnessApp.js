import React, { useState } from 'react';
import AvatarSelectionScreen from './AvatarSelectionScreen';
import HeygenAvatarScreen from './HeygenAvatarScreen';

export default function CoffeeWellnessApp() {
  const [selectedAvatar, setSelectedAvatar] = useState(null);

  const handleSelectAvatar = (avatar) => {
    console.log('Selected avatar:', avatar);
    setSelectedAvatar(avatar);
  };

  const handleBackToSelection = () => {
    setSelectedAvatar(null);
  };

  if (!selectedAvatar) {
    return (
      <AvatarSelectionScreen 
        onSelectAvatar={handleSelectAvatar} 
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