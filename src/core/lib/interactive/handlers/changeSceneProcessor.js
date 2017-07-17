const JsonDB = require('node-json-db')
const mixerInteractive = require('../mixer-interactive')

// Change Group
function changeScene(effect, boy) {
    var botGroupArray = [];

    if (effect.reset === true)
    {
        // We're resetting all groups back to default.
        var scenes = bot.scenes;

        // Get list of viable groups to compare against.
        for (scene in scenes){
            var groups = scenes[scene].default;
            for (group in groups){
                var groupID = groups[group];
                if(groupID !== "Nonde")
                {
                    botGroupArray.push(groupID);
                }
            }
        }
        // Always push the default scene since it always exists.
        botGroupArray.push('default');
        
    }
}