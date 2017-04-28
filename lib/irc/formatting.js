"use strict";

var sanitizeHtml = require('sanitize-html');
var htmlNamesToColorCodes = {
    white: ['\u000300'],
    black: ['\u000301', '\u00031'],
    navy: ['\u000302', '\u00032'],
    green: ['\u000303', '\u00033'],
    red: ['\u000304', '\u000305', '\u00034', '\u00035'],
    purple: ['\u000306', '\u00036'],
    olive: ['\u000307', '\u00037'],
    yellow: ['\u000308', '\u00038'],
    lime: ['\u000309', '\u00039'],
    teal: ['\u000310'],
    aqua: ['\u000311'],
    blue: ['\u000312'],
    fuchsia: ['\u000313'],
    gray: ['\u000314'],
    silver: ['\u000315']
};
// store the reverse mapping
var colorCodesToHtmlNames = {};
var htmlNames = Object.keys(htmlNamesToColorCodes);
htmlNames.forEach(function(htmlName) {
    htmlNamesToColorCodes[htmlName].forEach(function(colorCode) {
        colorCodesToHtmlNames[colorCode] = htmlName;
    });
});

var extendedColors = ['470000', '472100', '474700', '324700', '004700', '00472c', '004747', '002747', '000047', '2e0047', '470047', '47002a', '740000', '743a00', '747400', '517400', '007400', '007449', '007474', '004074', '000074', '4b0074', '740074', '740045', 'b50000', 'b56300', 'b5b500', '7db500', '00b500', '00b571', '00b5b5', '0063b5', '0000b5', '7500b5', 'b500b5', 'b5006b', 'ff0000', 'ff8c00', 'ffff00', 'b2ff00', '00ff00', '00ffa0', '00ffff', '008cff', '0000ff', 'a500ff', 'ff00ff', 'ff0098', 'ff5959', 'ffb459', 'ffff71', 'cfff60', '6fff6f', '65ffc9', '6dffff', '59b4ff', '5959ff', 'c459ff', 'ff66ff', 'ff59bc', 'ff9c9c', 'ffd39c', 'ffff9c', 'e2ff9c', '9cff9c', '9cffdb', '9cffff', '9cd3ff', '9c9cff', 'dc9cff', 'ff9cff', 'ff94d3', '000000', '131313', '282828', '363636', '4d4d4d', '656565', '818181', '9f9f9f', 'bcbcbc', 'e2e2e2', 'ffffff'];
var extendedColorCodesToHex = {};
for(var i = 0; i < extendedColors.length; i++) {
    extendedColorCodesToHex["\u0003"+(16+i)] = "#" + extendedColors[i];
}

var STYLE_BOLD = '\u0002';
var STYLE_ITALICS = '\u001d';
var STYLE_UNDERLINE = '\u001f';
var STYLE_CODES = [STYLE_BOLD, STYLE_ITALICS, STYLE_UNDERLINE];
var RESET_CODE = '\u000f';

function escapeHtmlChars(text) {
    return text
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#39;"); // to work on HTML4 (&apos; is HTML5 only)
}

module.exports.stripIrcFormatting = function(text) {
    return text
        .replace(/(\x03\d{0,2}(,\d{0,2})?|\u200B)/g, '') // strip colors
        .replace(/[\x0F\x02\x16\x1F]/g, ''); // styles too
};

module.exports.htmlToIrc = function(html) {
    if (!html) {
        return html;
    }

    // Sanitize the HTML first to allow us to regex parse this (which also does
    // things like case-sensitivity and spacing)
    var cleanHtml = sanitizeHtml(html, {
        allowedTags: ["b", "i", "u", "strong", "font", "em"],
        allowedAttributes: {
            font: ["color"]
        }
    });
    if (cleanHtml !== html) {
        // There are unrecognised tags. Let's play it safe and break, we can always
        // use the fallback text.
        return null;
    }

    // noddy find/replace on OPEN tags is possible now
    var replacements = [
        [/<b>/g, STYLE_BOLD], [/<u>/g, STYLE_UNDERLINE], [/<i>/g, STYLE_ITALICS],
        [/<strong>/g, STYLE_BOLD], [/<em>/g, STYLE_ITALICS]
    ];
    Object.keys(htmlNamesToColorCodes).forEach(function(htmlColor) {
        replacements.push([
            new RegExp('<font color="' + htmlColor + '">', 'g'),
            htmlNamesToColorCodes[htmlColor][0]
        ]);
    });
    for (var i = 0; i < replacements.length; i++) {
        var rep = replacements[i];
        cleanHtml = cleanHtml.replace(rep[0], rep[1]);
    }
    // this needs a single pass through to fix up the reset codes, as they
    // 'close' all open tags. This pass through checks which tags are open and
    // then reopens them after a reset code.
    var openStyleCodes = [];
    var closeTagsToStyle = {
        "</b>": STYLE_BOLD,
        "</u>": STYLE_UNDERLINE,
        "</i>": STYLE_ITALICS,
        "</em>": STYLE_ITALICS,
        "</strong>": STYLE_BOLD
    };
    var closeTags = Object.keys(closeTagsToStyle);
    var replacement;
    for (i = 0; i < cleanHtml.length; i++) {
        var ch = cleanHtml[i];
        if (STYLE_CODES.indexOf(ch) >= 0) {
            openStyleCodes.push(ch);
        }
        else if (ch === "<") {
            if (cleanHtml.indexOf("</font>", i) === i) {
                replacement = RESET_CODE + openStyleCodes.join("");
                cleanHtml = cleanHtml.replace(
                    "</font>", replacement
                );
                i += (replacement.length - 1);
            }
            else {
                for (var closeTagIndex = 0; closeTagIndex < closeTags.length; closeTagIndex++) {
                    var closeTag = closeTags[closeTagIndex];
                    if (cleanHtml.indexOf(closeTag, i) === i) {
                        // replace close tag with a reset and pop off the open
                        // formatting code, then reopen remaining tags
                        openStyleCodes.splice(openStyleCodes.indexOf(
                            closeTagsToStyle[closeTag]
                        ), 1);
                        replacement = RESET_CODE + openStyleCodes.join("");
                        cleanHtml = cleanHtml.replace(
                            closeTag, replacement
                        );
                        i += (replacement.length - 1);
                    }
                }
            }
        }
    }
    // sanitize any other tags that are left. We don't know how to handle 'em.
    cleanHtml = cleanHtml.replace(/<[^>]+>/gm, "");

    // unescape html characters
    var escapeChars = [
        [/&gt;/g, '>'], [/&lt;/g, '<'], [/&quot;/g, '"'], [/&amp;/g, '&']
    ];
    escapeChars.forEach(function(escapeSet) {
        cleanHtml = cleanHtml.replace(escapeSet[0], escapeSet[1]);
    });

    return cleanHtml;
};

module.exports.ircToHtml = function(text) {
    text = escapeHtmlChars(text);

    // Color codes look like 003xx or 003xx,yy (xx=foreground, yy=background)
    // We want to match until it hits another color (starting 003) or hits the
    // reset code 000f. That is the 'end tag', represented as a non-greedy match
    // for the reset code, or any character until 003.
    //
    //                  Foreground          Background      End 'tag'
    //                 ______|_______       ____|____    _______|________
    //                /              \     /         \  /                \
    var colorRegex = /(\003[0-9]{1,2})[,]?([0-9]{1,2})?(.*?\u000f|[^\003]+)/;
    var groups;
    if (colorRegex.test(text)) {
        groups = colorRegex.exec(text);
        while (groups) {
            var colorCode = groups[1];
            // ignore bg for now (groups[2])

            // this text includes the reset code so the code can be applied for
            // each formatting code. We'll strip it later on.
            var coloredText = groups[3];
            var fontColor = colorCodesToHtmlNames[colorCode]
		|| extendedColorCodesToHex[colorCode];
            if (fontColor) {
                text = text.replace(
                    groups[0],
                    '<font color="' + fontColor + '">' +
                    coloredText +
                    '</font>'
                );
            }
            else {
                // unknown font colour
                text = text.replace(groups[0], coloredText);
            }
            groups = colorRegex.exec(text);
        }
    }

    // force there to always be a RESET code at the end of the text to make sure
    // we close up all open style tags at the end.
    if (text.length > 0 && text[text.length - 1] !== RESET_CODE) {
        text = text + RESET_CODE;
    }

    // Convert styles to bold/italics/underline
    //
    // Maintain a small state machine of which tags are open so we can close the right
    // ones on RESET codes and toggle appropriately if they do the same code again.
    let boldOpen = false;
    let italicsOpen = false;
    let underlineOpen = false;
    for (let i = 0; i < text.length; i++) {
        let char = text[i];
        let charsToInsert = "";
        switch (char) {
            case STYLE_BOLD:
                boldOpen = !boldOpen;
                charsToInsert = boldOpen ? "<b>" : "</b>";
                break;
            case STYLE_ITALICS:
                italicsOpen = !italicsOpen;
                charsToInsert = italicsOpen ? "<i>" : "</i>";
                break;
            case STYLE_UNDERLINE:
                underlineOpen = !underlineOpen;
                charsToInsert = underlineOpen ? "<u>" : "</u>";
                break;
            case RESET_CODE:
                if (boldOpen) {
                    charsToInsert += "</b>";
                }
                if (italicsOpen) {
                    charsToInsert += "</i>";
                }
                if (underlineOpen) {
                    charsToInsert += "</u>";
                }
                boldOpen = false;
                italicsOpen = false;
                underlineOpen = false;
                break;
            default:
                break;
        }
        if (charsToInsert.length > 0) {
            // Insert the text into this location and remove the style code (the +1 in i+1)
            // Increment i by the number of *additional* chars (which is the length-1)
            text = text.slice(0, i) + charsToInsert + text.slice(i+1);
            i += charsToInsert.length - 1;
        }
    }

    // The text NOW needs the reset code(s) stripped out from it, since we've
    // finished applying all the formatting.
    text = text.replace(/\u000f/g, "");

    return text;
};

module.exports.toIrcLowerCase = function(str, caseMapping) {
    caseMapping = caseMapping || "rfc1459";
    var lower = str.toLowerCase();
    if (caseMapping === "rfc1459") {
        lower = lower.
        replace(/\[/g, "{").
        replace(/\]/g, "}").
        replace(/\\/g, "|").
        replace(/\^/g, "~");
    }
    else if (caseMapping === "strict-rfc1459") {
        lower = lower.
        replace(/\[/g, "{").
        replace(/\]/g, "}").
        replace(/\\/g, "|");
    }

    return lower;
};
