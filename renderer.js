document.addEventListener('DOMContentLoaded', () => {
    // --- UI Element Declarations ---
    const views = {
        'time-tracker': document.getElementById('time-tracker'),
        'cmf-creator': document.getElementById('cmf-creator'),
        'analytics-view': document.getElementById('analytics-view'),
        'projects-view': document.getElementById('projects-view'),
        'settings-view': document.getElementById('settings-view'),
    };
    const totalPointsDisplay = document.getElementById('total-points');
    const logList = document.getElementById('log-list');
    const editLogModal = document.getElementById('edit-log-modal');
    const editLogDateInput = document.getElementById('edit-log-date');
    const editLogTimeInput = document.getElementById('edit-log-time');
    const editLogProjectInput = document.getElementById('edit-log-project');
    const editLogDescriptionInput = document.getElementById('edit-log-description');
    const saveEditedLogBtn = document.getElementById('save-edited-log-btn');
    const cancelEditBtn = document.getElementById('cancel-edit-btn');
    const logDatePicker = document.getElementById('log-date-picker');
    const currentTaskDescriptionInput = document.getElementById('current-task-description');
    const timerDisplay = document.querySelector('.timer-display');
    const startBtn = document.getElementById('start-btn');
    const pauseBtn = document.getElementById('pause-btn');
    const stopBtn = document.getElementById('stop-btn');
    const cmfForm = document.getElementById('cmf-form');
    const exportJsonBtn = document.getElementById('export-json-btn');
    const startKeybindInput = document.getElementById('start-keybind');
    const pauseKeybindInput = document.getElementById('pause-keybind');
    const stopKeybindInput = document.getElementById('stop-keybind');
    const saveSettingsBtn = document.getElementById('save-settings-btn');
    const themeSwitcherBtn = document.getElementById('theme-switcher-btn');
    const projectListEl = document.getElementById('project-list');
    const newProjectNameInput = document.getElementById('new-project-name');
    const addProjectBtn = document.getElementById('add-project-btn');
    const appVersionEl = document.getElementById('app-version');
    const checkForUpdateBtn = document.getElementById('check-for-update-btn');
    const updateLogOutputEl = document.getElementById('update-log-output');
    const startupCheckbox = document.getElementById('startup-checkbox');
    const openTemplateBrowserBtn = document.getElementById('open-template-browser-btn');
    const templateBrowserModal = document.getElementById('template-browser-modal');
    const closeTemplateBrowserBtn = document.getElementById('close-template-browser-btn');
    const templateListEl = document.getElementById('template-list');
    const templateInputModal = document.getElementById('template-input-modal');
    const templateInputContainer = document.getElementById('template-input-container');
    const confirmTemplateInputBtn = document.getElementById('confirm-template-input-btn');
    const cancelTemplateInputBtn = document.getElementById('cancel-template-input-btn');
    const exportTodayBtn = document.getElementById('export-today-btn');

    // --- State Variables ---
    let allLogs = [];
    let currentLogIdToEdit = null;
    let isContinuingLog = false;
    let originalLogToContinue = null;
    let projects = [];
    let currentSettings = {};
    let smartTemplates = [];
    let selectedSmartTemplate = null;
    let timer;
    let seconds = 0;
    let isPaused = false;

    // --- Sidebar Navigation ---
    document.querySelectorAll('.sidebar-item').forEach(item => {
        item.addEventListener('click', () => {
            document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active-view'));
            item.classList.add('active-view');
            const viewName = item.getAttribute('data-view');
            for (const id in views) {
                if (views[id]) views[id].classList.remove('active');
            }
            if (views[viewName]) {
                views[viewName].classList.add('active');
            }
        });
    });
    document.querySelector('.sidebar-item[data-view="time-tracker"]').classList.add('active-view');

    // --- Helper Functions ---
    function formatTime(sec) {
        const hours = Math.floor(sec / 3600).toString().padStart(2, '0');
        const minutes = Math.floor((sec % 3600) / 60).toString().padStart(2, '0');
        const secondsLeft = (sec % 60).toString().padStart(2, '0');
        return `${hours}:${minutes}:${secondsLeft}`;
    }

    function formatTimeToSeconds(timeString) {
        const parts = timeString.split(':').map(Number);
        return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }

    // --- UI Rendering and State ---
    function updateDisplay() {
        timerDisplay.textContent = formatTime(seconds);
    }
    
    const applyTheme = (theme) => {
        document.body.classList.toggle('light-theme', theme === 'light');
        themeSwitcherBtn.textContent = theme === 'light' ? 'Switch to Dark Theme' : 'Switch to Light Theme';
    };

    const renderProjects = () => {
        projectListEl.innerHTML = '';
        projects.forEach(project => {
            const projectItem = document.createElement('div');
            projectItem.className = 'project-item';
            projectItem.innerHTML = `<span>${project}</span><button class="delete-project-btn" data-project-name="${project}">Delete</button>`;
            projectListEl.appendChild(projectItem);
        });
    };
    
    // --- Core Data and Business Logic ---
    async function loadAndRenderLogs() {
        allLogs = await window.electronAPI.getTimeLogs();
        logList.innerHTML = '';
        const currentDisplayDate = logDatePicker.value;
        const todayFormattedForComparison = (new Date()).toLocaleDateString('en-CA');
        
        const todayLogsForPoints = allLogs.filter(log => log && log.date === todayFormattedForComparison);
        let totalPoints = todayLogsForPoints.reduce((sum, log) => sum + (log.points || 0), 0);
        totalPointsDisplay.textContent = totalPoints;

        const logsToDisplay = allLogs.filter(log => log && log.date === currentDisplayDate);
        logsToDisplay.reverse().forEach(log => {
            if (!log) {
                console.warn("Skipping rendering of a null/undefined log entry.");
                return; 
            }

            const logItem = document.createElement('div');
            logItem.className = 'log-item';
            
            let logIdentifier = '';
            try {
                const logJsonString = JSON.stringify(log);
                if (logJsonString) {
                    logIdentifier = encodeURIComponent(logJsonString);
                }
            } catch (e) {
                console.error("Error stringifying log object for rendering. This log will not be actionable.", log, e);
            }

            const actionButtonsHtml = logIdentifier === '' ? 
                `<div class="log-actions" style="opacity: 0.3;">
                    <button disabled title="Cannot act on malformed log">Edit</button>
                    <button disabled title="Cannot act on malformed log">Delete</button>
                    <button disabled title="Cannot act on malformed log">Restart</button>
                </div>` :
                `<div class="log-actions">
                    <button class="edit-log-btn" data-log-id="${logIdentifier}" title="Edit this log">Edit</button>
                    <button class="delete-log-btn" data-log-id="${logIdentifier}" title="Delete this log">Delete</button>
                    <button class="restart-log-btn" data-log-id="${logIdentifier}" title="Restart this task">Restart</button>
                </div>`;

            logItem.innerHTML = `
                <span class="log-time">${log.time || '00:00:00'}</span>
                <span class="log-project">${log.project || 'No Project'}</span>
                <span class="log-desc">${log.description || ''}</span>
                <span class="log-points">${log.points || 0} Pts</span>
                ${actionButtonsHtml}
            `;
            logList.appendChild(logItem);
        });
    }

    async function loadUsername() {
        const userProfile = document.querySelector('.user-profile');
        const username = await window.electronAPI.getUsername();
        userProfile.textContent = username;
    }

    async function loadAllSettings() {
        currentSettings = await window.electronAPI.getSettings();
        projects = currentSettings.projects || [];
        applyTheme(currentSettings.theme);
        renderProjects();
        if (currentSettings.keybindings) {
            startKeybindInput.value = currentSettings.keybindings.start || '';
            pauseKeybindInput.value = currentSettings.keybindings.pause || '';
            stopKeybindInput.value = currentSettings.keybindings.stop || '';
        }
        const version = await window.electronAPI.getAppVersion();
        appVersionEl.textContent = `v${version}`;

        // Load startup settings
        const loginSettings = await window.electronAPI.getLoginItemSettings();
        startupCheckbox.checked = loginSettings.openAtLogin;
    }

    async function saveAllSettings() {
        const newSettings = {
            ...currentSettings,
            theme: document.body.classList.contains('light-theme') ? 'light' : 'dark',
            projects: projects,
            keybindings: {
                start: startKeybindInput.value.trim(),
                pause: pauseKeybindInput.value.trim(),
                stop: stopKeybindInput.value.trim(),
            }
        };
        const result = await window.electronAPI.saveSettings(newSettings);
        if (result.success) {
            alert('Settings saved successfully!');
            currentSettings = newSettings;
        } else {
            alert(`Error saving settings: ${result.message}`);
        }
    }
    
    // --- Event Listeners ---
    logDatePicker.addEventListener('change', loadAndRenderLogs);
    startBtn.addEventListener('click', () => {
        if (!timer) {
            isPaused = false;
            timer = setInterval(() => {
                if (!isPaused) {
                    seconds++;
                    updateDisplay();
                }
            }, 1000);
        }
    });

    pauseBtn.addEventListener('click', () => {
        isPaused = !isPaused;
        pauseBtn.textContent = isPaused ? 'Resume' : 'Pause';
    });

    stopBtn.addEventListener('click', async () => {
        if (timer) {
            clearInterval(timer);
            timer = null;
            if (isContinuingLog && originalLogToContinue) {
                editLogDateInput.value = originalLogToContinue.date;
                editLogTimeInput.value = formatTime(seconds);
                editLogProjectInput.value = originalLogToContinue.project || '';
                editLogDescriptionInput.value = originalLogToContinue.description || '';
                currentLogIdToEdit = encodeURIComponent(JSON.stringify(originalLogToContinue));
                editLogModal.classList.add('active');
            } else {
                const result = await window.electronAPI.openInputWindow(formatTime(seconds));
                if (result && result.success) {
                    loadAndRenderLogs();
                }
                seconds = 0;
                updateDisplay();
                pauseBtn.textContent = 'Pause';
                currentTaskDescriptionInput.value = '';
            }
        }
    });

    cmfForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const getCheckState = (groupName, targetValue) => {
            const selected = document.querySelector(`input[name="${groupName}"]:checked`)?.value;
            return selected === targetValue ? "☒" : "☐";
        };
        const getVal = (id) => document.getElementById(id).value;
        const data = {
            REQUESTOR: getVal('cmf-requestor'),
            CHANGE_NAME: getVal('cmf-name'),
            requestor: getVal('cmf-requestor'),
            date: (new Date()).toLocaleDateString(),
            description: getVal('cmf-description'),
            urgem: getCheckState('urgency', 'urgem'),
            urgnorm: getCheckState('urgency', 'urgnorm'),
            urglow: getCheckState('urgency', 'urglow'),
            urgmaint: getCheckState('urgency', 'urgmaint'),
            sevcrit: getCheckState('severity', 'sevcrit'),
            sevhigh: getCheckState('severity', 'sevhigh'),
            sevnorm: getCheckState('severity', 'sevnorm'),
            sevlow: getCheckState('severity', 'sevlow'),
            customersimpacted: getVal('cmf-customers'),
            timeneeded: getVal('cmf-time'),
            stepschange: getVal('cmf-stepschange'),
            stepsverify: getVal('cmf-stepsverify'),
            stepsrevert: getVal('cmf-stepsrevert'),
            resources: getVal('cmf-resources'),
        };
        window.electronAPI.saveCmf(data);
        cmfForm.reset();
        document.querySelector('input[name="urgency"][value="urgnorm"]').checked = true;
        document.querySelector('input[name="severity"][value="sevnorm"]').checked = true;
    });

    window.electronAPI.onLogsUpdated(loadAndRenderLogs);

    logList.addEventListener('click', (event) => {
        const targetButton = event.target.closest('button');
        if (!targetButton || targetButton.disabled) {
            return;
        }
        const logId = targetButton.dataset.logId;
        if (!logId) {
            return;
        }
        const logToActOn = allLogs.find(log => {
            if (!log) return false;
            try {
                return encodeURIComponent(JSON.stringify(log)) === logId;
            } catch {
                return false;
            }
        });
        if (!logToActOn) {
            alert('Error: Could not find the specified log entry to act on.');
            return;
        }
        if (targetButton.classList.contains('delete-log-btn')) {
            if (confirm(`Are you sure you want to delete this log?\n\n${logToActOn.description}`)) {
                window.electronAPI.deleteTimeLog(logId);
            }
        } else if (targetButton.classList.contains('edit-log-btn')) {
            currentLogIdToEdit = logId;
            editLogDateInput.value = logToActOn.date;
            editLogTimeInput.value = logToActOn.time;
            editLogProjectInput.value = logToActOn.project || '';
            editLogDescriptionInput.value = logToActOn.description || '';
            editLogModal.classList.add('active');
            setTimeout(() => editLogDateInput.focus(), 50); 
            isContinuingLog = false;
        } else if (targetButton.classList.contains('restart-log-btn')) {
            if (timer) clearInterval(timer);
            seconds = formatTimeToSeconds(logToActOn.time);
            isPaused = false;
            isContinuingLog = true;
            originalLogToContinue = logToActOn;
            currentTaskDescriptionInput.value = logToActOn.description;
            updateDisplay();
            startBtn.click();
        }
    });
    
    saveSettingsBtn.addEventListener('click', saveAllSettings);

    themeSwitcherBtn.addEventListener('click', () => {
        const isLight = document.body.classList.contains('light-theme');
        applyTheme(isLight ? 'dark' : 'light');
    });

    addProjectBtn.addEventListener('click', () => {
        const newProjectName = newProjectNameInput.value.trim();
        if (newProjectName && !projects.includes(newProjectName)) {
            projects.push(newProjectName);
            projects.sort();
            newProjectNameInput.value = '';
            renderProjects(); // Re-render the project list
            saveAllSettings();
        }
    });

    projectListEl.addEventListener('click', (event) => {
        if (event.target.classList.contains('delete-project-btn')) {
            const projectNameToDelete = event.target.dataset.projectName;
            if (confirm(`Are you sure you want to delete the project "${projectNameToDelete}"?`)) {
                projects = projects.filter(p => p !== projectNameToDelete);
                renderProjects();
                saveAllSettings();
            }
        }
    });

    saveEditedLogBtn.addEventListener('click', async () => {
        const logToUpdate = allLogs.find(log => encodeURIComponent(JSON.stringify(log)) === currentLogIdToEdit);
        if (logToUpdate && /^\d{2}:\d{2}:\d{2}$/.test(editLogTimeInput.value)) {
            await window.electronAPI.updateTimeLog({
                oldDate: logToUpdate.date, oldTime: logToUpdate.time, oldDescription: logToUpdate.description, oldProject: logToUpdate.project,
                newDate: editLogDateInput.value, newTime: editLogTimeInput.value, newDescription: editLogDescriptionInput.value.trim(), newProject: editLogProjectInput.value.trim(),
            });
            loadAndRenderLogs();
        } else {
            return alert('Invalid time format (HH:MM:SS).');
        }
        editLogModal.classList.remove('active');
        if (isContinuingLog) {
            seconds = 0;
            updateDisplay();
            isContinuingLog = false;
            timer = null;
        }
    });

    cancelEditBtn.addEventListener('click', () => {
        editLogModal.classList.remove('active');
        if (isContinuingLog) {
            seconds = 0;
            updateDisplay();
            isContinuingLog = false;
        }
    });

    exportTodayBtn.addEventListener('click', () => {
        const selectedDate = logDatePicker.value;
        if (!selectedDate) {
            return alert('Please select a date to export.');
        }

        const logsToExport = allLogs.filter(log => log.date === selectedDate);

        if (logsToExport.length > 0) {
            window.electronAPI.exportLogsJson({
                logs: logsToExport,
                date: selectedDate,
            });
            alert(`Summary for ${selectedDate} exported successfully!`);
        } else {
            alert('No logs to export for the selected date.');
        }
    });
    
    // --- Keybinding Setup ---
    const handleKeydown = (e) => {
        e.preventDefault();
        const parts = [];
        if (e.ctrlKey) parts.push('Ctrl');
        if (e.shiftKey) parts.push('Shift');
        if (e.altKey) parts.push('Alt');
        if (e.metaKey) parts.push('Cmd');
        const key = e.key.toUpperCase();
        if (!['CONTROL', 'SHIFT', 'ALT', 'META'].includes(key)) parts.push(key);
        e.target.value = parts.join('+');
    };

    [startKeybindInput, pauseKeybindInput, stopKeybindInput].forEach(input => {
        input.addEventListener('focus', () => { input.value = 'Recording...'; input.addEventListener('keydown', handleKeydown); });
        input.addEventListener('blur', () => { if (input.value === 'Recording...') input.value = currentSettings.keybindings[input.id.split('-')[0]] || ''; input.removeEventListener('keydown', handleKeydown); });
    });
    
    window.electronAPI.onGlobalShortcut((event, action) => {
        if(action === 'start') startBtn.click();
        if(action === 'pause') pauseBtn.click();
        if(action === 'stop') stopBtn.click();
    });

    // --- Update Logic ---
    checkForUpdateBtn.addEventListener('click', () => {
        updateLogOutputEl.innerHTML = ''; // Clear log on new check
        window.electronAPI.checkForUpdate();
    });

    window.electronAPI.onUpdateLog((message) => {
        const logLine = document.createElement('div');
        logLine.textContent = message;
        updateLogOutputEl.appendChild(logLine);
        updateLogOutputEl.scrollTop = updateLogOutputEl.scrollHeight; // Auto-scroll
    });

    startupCheckbox.addEventListener('change', () => {
        const openAtLogin = startupCheckbox.checked;
        window.electronAPI.setLoginItemSettings({ openAtLogin });
        currentSettings.openAtLogin = openAtLogin;
        saveAllSettings(); // Save this preference in our main settings file too
    });

    // --- Smart Template Logic ---
    openTemplateBrowserBtn.addEventListener('click', openTemplateBrowser);
    closeTemplateBrowserBtn.addEventListener('click', () => {
        templateBrowserModal.classList.remove('active');
    });

    confirmTemplateInputBtn.addEventListener('click', () => {
        if (!selectedSmartTemplate) return;
        const data = JSON.parse(JSON.stringify(selectedSmartTemplate.data));
        const inputs = templateInputContainer.querySelectorAll('input');
        const values = {};
        inputs.forEach(input => {
            const key = input.id.replace('var-', '');
            values[key] = input.value;
        });
        for (const field in data) {
            if (typeof data[field] === 'string') {
                let text = data[field];
                for (const key in values) {
                    text = text.replace(new RegExp(`{{${key}}}`, 'g'), values[key]);
                }
                data[field] = text;
            }
        }
        populateFormWithData(data);
        templateInputModal.classList.remove('active');
    });

    cancelTemplateInputBtn.addEventListener('click', () => {
        templateInputModal.classList.remove('active');
    });

    async function openTemplateBrowser() {
        smartTemplates = await window.electronAPI.getSmartTemplates();
        templateListEl.innerHTML = '';
        
        if (smartTemplates.length === 0) {
            templateListEl.innerHTML = '<p style="padding: 20px; text-align: center; color: var(--color-text-secondary);">No templates found.</p>';
        } else {
            smartTemplates.forEach((tpl, index) => {
                const item = document.createElement('div');
                item.className = 'project-item';
                item.style.cursor = 'pointer';
                item.style.flexDirection = 'column';
                item.style.alignItems = 'flex-start';
                item.style.gap = '5px';
                
                item.innerHTML = `
                    <div style="font-weight: 600; color: var(--color-accent);">${tpl.name}</div>
                    <div style="font-size: 0.9rem; color: var(--color-text-secondary);">${tpl.description || ''}</div>
                `;
                
                item.addEventListener('click', () => {
                    selectTemplate(index);
                });
                
                templateListEl.appendChild(item);
            });
        }
        
        templateBrowserModal.classList.add('active');
    }

    function selectTemplate(index) {
        selectedSmartTemplate = smartTemplates[index];
        templateBrowserModal.classList.remove('active');
        
        if (!selectedSmartTemplate) return;

        if (selectedSmartTemplate.variables && selectedSmartTemplate.variables.length > 0) {
            templateInputContainer.innerHTML = '';
            document.getElementById('template-input-title').textContent = `Configure: ${selectedSmartTemplate.name}`;
            
            selectedSmartTemplate.variables.forEach(v => {
                const wrapper = document.createElement('div');
                wrapper.className = 'form-group';
                const label = document.createElement('label');
                label.textContent = v.label;
                const input = document.createElement('input');
                input.type = 'text';
                input.id = `var-${v.key}`;
                input.placeholder = v.placeholder || '';
                wrapper.appendChild(label);
                wrapper.appendChild(input);
                templateInputContainer.appendChild(wrapper);
            });
            
            templateInputModal.classList.add('active');
            
            setTimeout(() => {
                const first = templateInputContainer.querySelector('input');
                if (first) first.focus();
            }, 50);
        } else {
            populateFormWithData(selectedSmartTemplate.data);
        }
    }

    // --- Initial Application Load ---
    async function initialLoad() {
        logDatePicker.value = (new Date()).toLocaleDateString('en-CA');
        await loadUsername();
        await loadAndRenderLogs();
        await loadAllSettings();
    }

    window.electronAPI.onCmfSaved(() => {
        alert('CMF file saved successfully!');
    });

    initialLoad();
});