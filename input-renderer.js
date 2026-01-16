document.addEventListener('DOMContentLoaded', () => {
    const projectSelect = document.getElementById('project-select'); // Changed to select
    const descriptionInput = document.getElementById('description-input');
    const saveLogBtn = document.getElementById('save-log-btn');

    let timeToSave = '';

    window.inputAPI.onTimeData((event, data) => { // data will be an object { time, projects, theme }
        timeToSave = data.time;

        // Apply the theme
        if (data.theme === 'light') {
            document.body.classList.add('light-theme');
        }

        // Populate project dropdown
        projectSelect.innerHTML = '<option value="">No Project</option>'; // Keep default
        data.projects.forEach(project => {
            const option = document.createElement('option');
            option.value = project;
            option.textContent = project;
            projectSelect.appendChild(option);
        });

        // Request a resize of the window based on content
        const height = document.body.scrollHeight + 40; // Add some padding
        window.inputAPI.resizeWindow(height);
    });

    saveLogBtn.addEventListener('click', () => {
        const description = descriptionInput.value.trim();
        const project = projectSelect.value; // Get selected project from dropdown

        if (description) {
            window.inputAPI.saveLog({
                time: timeToSave,
                description,
                project
            });
        }
    });
});
