'use client';

import { useState, useRef } from 'react';
import { createClient } from '@/utils/supabase';

export default function UploadAudioScreen({ onNavigate, projectId, existingAudioUrl, onUploadSuccess }) {
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef(null);
  const supabase = createClient();

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!projectId) {
      alert("No project session found. Please go back to the dashboard.");
      return;
    }

    setIsUploading(true);
    try {
      // 1. Upload the new file first (Safety First)
      const fileName = `${projectId}/${Date.now()}-${file.name}`;
      const { data, error } = await supabase.storage
        .from('assets')
        .upload(fileName, file);

      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage
        .from('assets')
        .getPublicUrl(fileName);

      // 2. Update the project record in the database
      const { error: updateError } = await supabase
        .from('projects')
        .update({ audio_url: publicUrl })
        .eq('id', projectId);

      if (updateError) throw updateError;

      // 3. Notify parent
      if (onUploadSuccess) onUploadSuccess(publicUrl);

      // 4. Cleanup: Now that the new file is safe, delete the old one
      if (existingAudioUrl) {
        try {
          // Extract path more robustly (handle any URL version)
          const urlParts = existingAudioUrl.split('/assets/');
          let oldPath = urlParts[urlParts.length - 1];
          
          // IMPORTANT: Decode URL characters (like %20 back to spaces)
          oldPath = decodeURIComponent(oldPath);
          
          console.log("Attempting to delete old file at decoded path:", oldPath);
          
          if (oldPath) {
            const { data: deleteData, error: deleteError } = await supabase.storage
              .from('assets')
              .remove([oldPath]);
            
            if (deleteError) {
              console.error("Supabase Storage Delete Error:", deleteError);
            } else {
              console.log("Successfully deleted old file:", deleteData);
            }
          }
        } catch (cleanupErr) {
          console.warn("Upload succeeded but old file cleanup logic crashed:", cleanupErr);
        }
      }

      // 5. Move to next screen
      onNavigate(3);
    } catch (err) {
      console.error("Upload failed:", err);
      alert("Upload failed. Make sure the 'assets' bucket exists and is public.");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="screen active" id="s2">
      {/* Hidden file input - now always present in the DOM */}
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        accept="audio/*" 
        style={{ display: 'none' }} 
      />

      <div className="center-content">
        {existingAudioUrl && !isUploading ? (
          <div className="upload-zone" style={{ padding: '70px 120px', borderColor: 'var(--teal)', background: 'rgba(61, 140, 122, 0.05)' }}>
            <div className="upload-icon" style={{ color: 'var(--teal)' }}>✅</div>
            <div style={{ color: 'var(--teal)', fontWeight: 700, marginBottom: '10px' }}>Audio Uploaded!</div>
            <button 
              className="btn-teal" 
              onClick={() => onNavigate(3)}
              style={{ marginBottom: '12px' }}
            >
              Continue to Script
            </button>
            <div 
              onClick={() => fileInputRef.current?.click()}
              style={{ fontSize: '12px', color: '#666', cursor: 'pointer', textDecoration: 'underline' }}
            >
              Replace audio file
            </div>
          </div>
        ) : (
          <div
            className="upload-zone"
            onClick={() => !isUploading && fileInputRef.current?.click()}
            style={{ padding: '70px 120px', cursor: isUploading ? 'wait' : 'pointer' }}
          >
            <div className="upload-icon">{isUploading ? '⌛' : '🎵'}</div>
            <button
              className="btn-orange"
              disabled={isUploading}
              style={{ fontSize: '15px', padding: '14px 40px' }}
            >
              {isUploading ? 'Uploading...' : 'Upload Audio'}
            </button>
            <div className="upload-hint">MP3, WAV, FLAC · max 200MB</div>
          </div>
        )}
        
        <div style={{ fontSize: '12px', color: '#aaa', marginTop: '16px' }}>
          {isUploading ? 'Please wait while we process your track...' : 'Your track will be used to generate the video rhythm'}
        </div>
      </div>
    </div>
  );
}
