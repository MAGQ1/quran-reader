/*
Updater Helper - Enyo
 Version 0.3
 Created: 2022
 Author: Jon W
 License: MIT
 Description: A helper to check for and get updates from App Museum II web service.
    Does not require App Museum to be installed, but does require internet access, and Preware to do the actual install.
 Source: Find the latest version of this library and clean samples of how to use it on GitHub:
    https://github.com/webosarchive/webos-common
*/

//** Note: If you synced this file from a common repository, local edits may be over-written! */

/*
 LOCAL CHANGES for Quran Reader by MAGQ (original is MIT licensed, see licenses/webos-common-MIT.txt):
  1. Privacy: no device serial number or hardware ID (nduid) is sent. The "client id" is a
     random ID made on first use (kept in a cookie), and uniqueId() now makes a longer one.
  2. New events so the app can tell the user what happened: onNoUpdate, onCheckFailed,
     onInstallFailed (the original only wrote to the log).
  3. An empty or unreadable answer from the server no longer throws an error.
  4. Declared the variables the original leaked as globals (locale, versionNumParts).
  5. The web address grew on every check (it overwrote its own base address); it now keeps
     the base address and builds each request from it.
*/

enyo.kind({
    name: "Helpers.Updater",
    kind: "Control",
    sender: null,
    LastUpdateResponse: null,
    VersionNote: "",
    deviceId: null,
    appName: null,
    events: {
        onUpdateFound: "",
        onNoUpdate: "",
        onCheckFailed: "",
        onInstallFailed: ""
    },
    published: {
        handleUI: true
    },

    create: function() {
        this.inherited(arguments);
        this.baseUrl = this.$.updateServiceCheck.url;   // remember it: the request URL is rebuilt from this each time
        enyo.log("Updater Helper created.");
    },

    //#region Public
    //  You can call these methods from your code
    CheckForUpdate: function(appName) {
        if (appName) {
            this.appName = appName;
            this.performIdentifiedUpdateCheck();
        }
    },

    PromptUserForUpdate: function(message) {
        if (this.LastUpdateResponse == null) {
            enyo.log("Updater Helper: Not prompting user for update when no update has been discovered.");
        } else {
            if (!message)
                message = "An update for this app was found in App Museum II:<br><br>" + this.VersionNote + "<br><br>Do you want to update now?";
            else
                message = "An update for this app was found in App Museum II:<br><br>" + message + "<br><br>Do you want to update now?";
            this.$.updateMsg.setContent(message);
            this.$.updatePopUp.openAtCenter();
        }
    },

    InstallViaPreware: function(app) {
        if (!app)
            app = this.LastUpdateResponse.downloadURI;
        this.$.installRequest.call({ id: "org.webosinternals.preware", params: { type: "install", file: app } });
    },
    //#endregion

    //#region Private
    //  These members are used by the public methods and aren't meant to be called directly
    components: [{
            name: "updateServiceCheck",
            kind: "WebService",
            url: "http://appcatalog.webosarchive.org/WebService/getLatestVersionInfo.php?app=",
            onSuccess: "updateCheckSuccess",
            onFailure: "updateCheckFailure"
        },
        {
            name: "installRequest",
            kind: "PalmService",
            service: "palm://com.palm.applicationManager",
            method: "open",
            onFailure: "installRequestFailed"
        },
        {
            kind: "Popup",
            name: "updatePopUp",
            lazy: false,
            layoutKind: "VFlexLayout",
            style: "width: 80%;min-height:288px",
            components: [
                { content: "<b>Update Available!</b>" },
                {
                    kind: "BasicScroller",
                    flex: 1,
                    components: [
                        { name: "updateMsg", kind: "HtmlContent", flex: 1, pack: "center", align: "left", style: "text-align: left;padding-top:10px;padding-bottom: 10px" }
                    ]
                },
                {
                    layoutKind: "HFlexLayout",
                    pack: "center",
                    components: [
                        { kind: "Button", caption: "Update Now", onclick: "updateConfirmClick" },
                        { kind: "Button", caption: "Later", onclick: "updateCancelClick" }
                    ]
                }
            ]
        },
    ],
    
    performIdentifiedUpdateCheck: function(inSender, inResponse) {

        var environment = enyo.fetchDeviceInfo();   //Find some info about the device (could be used for compat checks)
        var deviceData = navigator.userAgent;
        if (environment && environment.modelName) {
            var locale = enyo.g11n.currentLocale().getLocale();
            deviceData = environment.modelName + "/" + environment.platformVersion + "/" + (environment.carrierName || "WiFi") + "/" + locale;
        }
        if (!enyo.getCookie("updater-uuid")) {
            enyo.setCookie("updater-uuid", this.uniqueId());
        }
        this.deviceId = enyo.getCookie("updater-uuid");

        var newUrl = this.baseUrl + this.appName + "/" + enyo.fetchAppInfo().version;
        newUrl = newUrl + "&clientid=" + this.deviceId;
        newUrl = newUrl + "&device=" + encodeURIComponent(deviceData);
        
        if (location.protocol == 'https:') {
            newUrl = newUrl.replace("http://", "https://");
        }
        enyo.log("Update Helper is checking for updates with URL: " + newUrl);

        this.$.updateServiceCheck.setUrl(newUrl);
        this.$.updateServiceCheck.call();
    },

    updateCheckSuccess: function(inSender, inResponse, inRequest) {
        if (!inResponse || inResponse.version == null) {
            enyo.warn("Update Helper could not find a museum version number");
            this.doNoUpdate();
            return;
        }
        var currVersion = enyo.fetchAppInfo().version;
        enyo.log("Updater Helper found Current version: " + currVersion + ", Update version: " + inResponse.version);
        currVersion = this.getVersionObject(currVersion);
        if (inResponse.version != null) {
            this.LastUpdateResponse = inResponse;
            var museumVersion = this.getVersionObject(inResponse.version);
            if (this.isVersionHigher(currVersion, museumVersion)) {
                enyo.log("Updater Helper found an update in webOS App Museum II!");
                this.VersionNote = inResponse.versionNote;
                this.doUpdateFound(this.VersionNote);
                if (this.handleUI) {
                    enyo.log("Updater Helper is handling UI for user prompt.");
                    this.PromptUserForUpdate(this.VersionNote);
                }
            } else {
                enyo.log("Updater Helper did not find an update in webOS App Museum II!");
                this.doNoUpdate();
            }
        }
    },

    updateCheckFailure: function(inSender, inResponse, inRequest) {
        enyo.error("Got failure from update check: " + inResponse);
        this.doCheckFailed();
    },

    installRequestFailed: function(inSender, inResponse) {
        enyo.error("Updater Helper could not open Preware: " + enyo.json.stringify(inResponse));
        this.doInstallFailed();
    },

    updateConfirmClick: function() {
        this.$.updatePopUp.close();
        if (!this.LastUpdateResponse || !this.LastUpdateResponse.downloadURI) {
            enyo.warn("Updater Helper: Not performing update when no update has been discovered.");
        } else {
            enyo.log("Updater Helper doing update for: " + JSON.stringify(this.LastUpdateResponse));
            this.InstallViaPreware(this.LastUpdateResponse.downloadURI);
        }
    },

    updateCancelClick: function() {
        this.$.updatePopUp.close();
    },

    //Turn a version string into an object with three independent number values
    getVersionObject: function(versionNum) {
        var versionNumParts = versionNum.split(".");
        if (versionNumParts.length <= 2 || versionNumParts > 3) {
            enyo.log("Updater Helper: An invalid version number was passed, webOS version numbers are #.#.#");
            return false;
        } else {
            var versionObject = {
                majorVersion: versionNumParts[0] * 1,
                minorVersion: versionNumParts[1] * 1,
                buildVersion: versionNumParts[2] * 1
            }
            return versionObject;
        }
    },

    //Given a current version and a version to compare, return true or false if the compare version is newer
    isVersionHigher: function(currVersion, compareVersion) {
        if (!currVersion || !compareVersion) {
            enyo.log("Updater Helper: Pass the versions to compare. If the second version is higher than the first, this function will return true");
        } else {
            if (compareVersion.majorVersion > currVersion.majorVersion)
                return true;
            if (compareVersion.majorVersion == currVersion.majorVersion && compareVersion.minorVersion > currVersion.minorVersion)
                return true;
            if (compareVersion.majorVersion == currVersion.majorVersion && compareVersion.minorVersion == currVersion.minorVersion && compareVersion.buildVersion > currVersion.buildVersion)
                return true;
            return false;
        }
    },

    uniqueId: function() {
        var id = "";
        for (var i = 0; i < 4; i++) {   // 4 x 4 hex digits
            id += Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
        }
        return id;
    }

    //#endregion
});
