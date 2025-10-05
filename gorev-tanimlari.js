/**
 * @param {string} time 
 * @param {string} timeKey 
 * @param {string[]} roles 
 */
function createTasksForTime(time, timeKey, roles = ['izleyici', 'kurucu', 'organizator', 'result']) {
    const tasks = [];


    const taskTemplates = {
        izleyici: { key: `${timeKey}_izleyici`, label: `${time} İzleyici`, description: `Saat ${time} yayın izleyici görevi.` },
        kurucu: { key: `${timeKey}_kur`, label: `${time} Kurucu`, description: `Saat ${time} yayın kurulum görevi.` },
        organizator: { key: `${timeKey}_org`, label: `${time} Organizatör`, description: `Saat ${time} yayın organizatör görevi.` },
        result: { key: `${timeKey}_result`, label: `${time} Live/Result`, description: `Saat ${time} yayın sonuç görevi.` }
    };


    roles.forEach(role => {
        if (taskTemplates[role]) {
            tasks.push(taskTemplates[role]);
        }
    });

    return tasks;
}


const gorevListeleri = {
    haftaici: [
        ...createTasksForTime('15:00', '15_00'),
        ...createTasksForTime('15:00 2. Lobi', '15_002', ['izleyici']),
        ...createTasksForTime('18:00', '18_00'),
        ...createTasksForTime('18:00 2. Lobi', '18_002', ['izleyici']),      
        ...createTasksForTime('21:00', '21_00'),
        ...createTasksForTime('21:00 2. Lobi', '21_002', ['izleyici']),      
    ],
    haftasonu: [ 
        ...createTasksForTime('12:30', '12_30'),
        ...createTasksForTime('12:30 2. Lobi', '12_302', ['izleyici']), 
        ...createTasksForTime('15:00', '15_00'),
        ...createTasksForTime('15:00 2. Lobi', '15_002', ['izleyici']),
        ...createTasksForTime('18:00', '18_00'),
        ...createTasksForTime('18:00 2. Lobi', '18_002', ['izleyici']),
        ...createTasksForTime('21:00', '21_00'),
        ...createTasksForTime('21:00 2. Lobi', '21_002', ['izleyici']),
        ...createTasksForTime('00:30', '00_30'),
        ...createTasksForTime('00:30 2. Lobi', '00_302', ['izleyici']),
    ],
    pazar: [
        ...createTasksForTime('12:30', '12_30'),
        ...createTasksForTime('12:30 2. Lobi', '12_302', ['izleyici']), 
        ...createTasksForTime('15:00', '15_00'),
        ...createTasksForTime('15:00 2. Lobi', '15_002', ['izleyici']),
        ...createTasksForTime('18:00', '18_00'),
        ...createTasksForTime('18:00 2. Lobi', '18_002', ['izleyici']),
        ...createTasksForTime('21:00', '21_00'),
        ...createTasksForTime('21:00 2. Lobi', '21_002', ['izleyici']),
    ],
    varsayilan: [
        ...createTasksForTime('12:30', '12_30'),
        ...createTasksForTime('12:30 2. Lobi', '12_302', ['izleyici']), 
        ...createTasksForTime('15:00', '15_00'),
        ...createTasksForTime('15:00 2. Lobi', '15_002', ['izleyici']),
        ...createTasksForTime('18:00', '18_00'),
        ...createTasksForTime('18:00 2. Lobi', '18_002', ['izleyici']),
        ...createTasksForTime('21:00', '21_00'),
        ...createTasksForTime('21:00 2. Lobi', '21_002', ['izleyici']),
        ...createTasksForTime('00:30', '00_30'),
        ...createTasksForTime('00:30 2. Lobi', '00_302', ['izleyici']),
    ]
};


function groupTasksByTime(taskList) {
    const groups = {};
    if (!taskList) return groups; 

    taskList.forEach(task => {

        const timeMatch = task.label.match(/^(\d{2}:\d{2}( \d\.[.] Lobi)?)/);
        const time = timeMatch ? timeMatch[0] : "Genel";

        if (!groups[time]) {
            groups[time] = [];
        }
        groups[time].push(task);
    });
    return groups;
}

module.exports = { gorevListeleri, groupTasksByTime };
