// IT Beginner - Client-side JavaScript

document.addEventListener('DOMContentLoaded', function() {
  // Handle URL query parameters for alerts
  const params = new URLSearchParams(window.location.search);
  
  if (params.get('success') === '1') {
    showToast('Profile updated successfully!', 'success');
  }
  if (params.get('success') === 'password') {
    showToast('Password changed successfully!', 'success');
  }
  if (params.get('error') === 'wrongpassword') {
    showToast('Current password is incorrect.', 'error');
  }
  if (params.get('error') === 'passwordmatch') {
    showToast('Passwords do not match or are too short.', 'error');
  }

  // Close mobile sidebar on link click
  document.querySelectorAll('.sidebar .nav-link').forEach(link => {
    link.addEventListener('click', () => {
      const sidebar = document.getElementById('sidebar');
      const overlay = document.querySelector('.sidebar-overlay');
      if (sidebar) sidebar.classList.remove('open');
      if (overlay) overlay.classList.remove('show');
    });
  });

  // Note input: submit on Enter
  const noteInput = document.getElementById('noteInput');
  if (noteInput) {
    noteInput.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        const lessonId = document.getElementById('videoPlayer')?.dataset?.lessonId;
        if (lessonId) addNote(parseInt(lessonId));
      }
    });
  }
});

// Toast notification
function showToast(message, type) {
  const toast = document.createElement('div');
  toast.className = 'alert alert-' + type;
  toast.style.cssText = 'position:fixed;top:20px;right:20px;z-index:9999;max-width:400px;animation:fadeIn 0.3s ease;';
  toast.textContent = (type === 'success' ? '✅ ' : '⚠️ ') + message;
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

