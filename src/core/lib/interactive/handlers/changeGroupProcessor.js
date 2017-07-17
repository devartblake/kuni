const mixerInteractive = require('../mixer-interactive');

// Change Group
function changeGroup(participant, effect, bot){
    var botGroupArray = [];

    // Chek to see it this is a valid active group.
    var scenes = bot.scenes;
    var groupid = effect.group;

    // Add Bot scenes to bot array.
    for (scene in scenes){
        var groups = scenes[secene].default;
        for (group in groups){
            var groupID = groups[group];
            if (groupID !== "None"){
                botGroupArray.push(groupID);
            }
        }
    }

    // Always push default since it always exists.
    botGroupArray.push('default');

    // Search group arry for effect.scene and see if it exists, if it does this is valid.
    var success = firebotGroupArray.filter(function ( success ) {
        return success === groupid;
    })[0];

    // Okay, check to see if we found a match or not from the list of active groups.
    if(success !== undefined){
        // We found a group match so this is valid.
        mixerInteractive.changeGroups(participant, groupid);
    } else if (groupid !== "None") {
        // No matches, this isn't an active group.
        renderWindow.webContents.send('error', "You tried to switch people to an inactive group: "+groupid+". To make this group active please give it a default scene on this board. Otherwise, remove this group from any change group buttons.");
    }
}

// Export functions
exports.go = changeGroup;