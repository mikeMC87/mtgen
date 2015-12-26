﻿/*
    Typical url: http://www.mtgsalvation.com/printable-gatecrash-spoiler.html

    Typical card:
        <div class="spoiler-card w-card type-Creature subtype-Human subtype-Soldier confirmed r-common wm-orzhov num-5" "="">
            <a name="num-5"></a>
            <div class="cost"><nobr><img src="http://s3.mananation.com/images/mana/2.gif" class="mana" alt="{2}"><img src="http://s3.mananation.com/images/mana/w.gif" class="mana" alt="{W}"></nobr></div>
            <p><span class="title"><a href="http://s3.gatheringmagic.com.s3.amazonaws.com/images/sets/GTC/Basilica_Guards.jpg" class="thickbox"><img style="margin: 0px 5px 0px 0px;" src="http://s3.gatheringmagic.com/images/spoilers/pic.png" alt=""></a> <a href="http://www.coolstuffinc.com/main_viewCard.php?Card_Name=Basilica Guards&amp;viewtype=Magic%20the%20Gathering%20Cards">Basilica Guards</a></span></p>
            <div class="rarity smallertext">Com.</div>
            <p><span class="type smallertext">Creature – Human Soldier</span></p>
            <div class="text">Defender<br>
            Extort <i>(Whenever you cast a spell, you may pay {wb}. If you do, each opponent loses 1 life and you gain that much life.)</i></div>
            <div class="powtou">1/4</div>
            <div class="artist">Dan Scott</div>
            <div class="cardnum">5/249</div>
            <div class="source"><a href="http://www.wizards.com/magic/magazine/article.aspx?x=mtg/daily/feature/228">Gatecrash Mechanics</a></div>
        </div>
 */
var cardDataImporter = (function (my, $) {
    'use strict';

    // Event handling via Backbone: http://documentcloud.github.io/backbone/
    _.extend(my, Backbone.Events);

    my.loadAndProcessAllFiles = function (options) {
        // Import options into instance variables
        //$.each(options, function (value, key) {
        //    my[key] = value;
        //});
        $.extend(my, options);

        if (my.cardDataUrl === undefined || my.cardDataUrl.length < 1) {
            alert("ERROR: No card data url supplied. Cannot continue.");
            return;
        }

        // load all files and don't continue until all are loaded
        var promises = [];

        promises.push($.get('/proxy?u=' + my.cardDataUrl));

        // it's hard to parse the results unless they're all there, so we'll force something to be loaded for each even if it's missing
        if (my.imagesUrl !== undefined && my.imagesUrl.length > 0) {
            promises.push($.get('/proxy?u=' + my.imagesUrl));
        }
        else {
            promises.push($.get('/proxy?u=http://copper-dog.com/'));
        }

        if (my.exceptionsUrl !== undefined && my.exceptionsUrl.length > 0) {
            promises.push($.get('/proxy?u=' + my.exceptionsUrl));
        }
        else {
            promises.push($.get('/proxy?u=http://copper-dog.com/'));
        }

        my.trigger('data-loading');

        $.when.apply($, promises).done(function () {
            // the first result is essential
            var htmlCards = {
                data: arguments[0][0],
                urlSource: my.cardDataUrl
            }
            if (isBadResponse(htmlCards.data)) {
                alert("ERROR: No data retrieved from " + my.cardDataUrl + ". Response:" + htmlCards);
                return;
            }

            var htmlImages = {
                data: arguments[1][0],
                urlSource: my.imagesUrl
            }
            if (isBadResponse(htmlImages.data)) {
                htmlImages.data = undefined; // this is okay -- it'll just default to using all images form cards-data (GM or cardsMain.json)
            }

            var jsonExceptions = {
                data: arguments[2][0],
                urlSource: my.exceptionsUrl
            }
            if (isBadResponse(jsonExceptions.data)) {
                jsonExceptions.data = undefined; // this is okay -- it's optional
            }

            var setCode = my.setCode.trim();

            my.trigger('data-loaded');

            setTimeout(function () { createOutputJson(setCode, htmlCards, htmlImages, jsonExceptions); }, 100); // delay to let ui render
        });

    }

    function createOutputJson(setCode, htmlCards, htmlImages, jsonExceptions) {
        // Get card data -------------------------------------------------------------------------------------------------
        // All card data source come with image data that we usually want to override in the next step.
        var mainOut = my.api.getCardData(htmlCards.data, htmlCards.urlSource, setCode);
        var initialCardDataCount = mainOut.length;

        // Get image data -------------------------------------------------------------------------------------------------
        var imageDataCount = 0;
        if (htmlImages.data !== undefined) {
            var mainImages = my.api.getImageData(htmlImages.data, htmlImages.urlSource);
            imageDataCount = Object.size(mainImages);
        }

        // Apply Exceptions -------------------------------------------------------------------------------------------------
        if (jsonExceptions.data !== undefined) {
            jsonExceptions.data = JSON.parse(jsonExceptions.data);
        }
        jsonExceptions = addMatchTitles(jsonExceptions.data);

        mainOut = my.api.applyPropertyExceptions(mainOut, jsonExceptions);

        mainOut = my.api.applyAdditionDeletionExceptions(mainOut, jsonExceptions);

        // Add images to cards -------------------------------------------------------------------------------------------------
        mainOut = my.api.applyImagesToCards(mainOut, mainImages);

        // Apply Exceptions AGAIN -------------------------------------------------------------------------------------------------
        // issue: if I don't do the title fix from the exceptions NOW, it won't properly match the images...
        //        but if I ONLY do it now and there's a SRC override it'll ignore that...
        //        so for now we'll just do the exceptions TWICE
        mainOut = my.api.applyPropertyExceptions(mainOut, jsonExceptions);


        // Reporting -------------------------------------------------------------------------------------------------

        var out = "";
        if (imageDataCount < 1) {
            out += "<p>WARNING: No image data supplied. Using any images found with card data: " + htmlCards.urlSource + "</p>";
        }
        else {
            var missingSecondaryImageDataEntry = $.grep(mainOut, function (card, index) { return !card.hasOwnProperty("imageSourceOriginal"); });
            if (missingSecondaryImageDataEntry.length < 1) {
                out += "<p>No parsing errors.</p>";
            }
            else {
                out += "<p>The following cards had no image data from your image source:</p><ul>";
                missingSecondaryImageDataEntry = missingSecondaryImageDataEntry.sort(sortByTitle);
                $.each(missingSecondaryImageDataEntry, function (index, value) {
                    var comment = "";
                    if (value._comment) {
                        comment = "<em> - " + value._comment + "</em>";
                    }
                    out += "<li style='color:red'>" + value.title + comment + "</li>";
                });
                out += "</ul>";
            }

            var unusedImages = [];
            var key;
            for (key in mainImages) {
                if (mainImages.hasOwnProperty(key)) {
                    if (!mainImages[key].wasUsed) {
                        unusedImages.push(mainImages[key]);
                    }
                }
            }
            if (unusedImages.length > 0) {
                out += "<p>The following images from your image data source did not match any cards in your card data:</p><ul>";
                $.each(unusedImages, function (index, image) {
                    out += "<li style='color:red'>" + image.title + "</li>";
                });
                out += "</ul>";
            }
        }

        var cardsWithPlaceholderImages = $.grep(mainOut, function (card, index) { return card.imageSource === "placeholder"; });
        if (cardsWithPlaceholderImages.length > 0) {
            out += "<p>The following cards have no primary images or images supplied from your image source, so an image was created using <a href='http://placehold.it/' target='_blank'>placehold.it</a>:</p><ul>";
            $.each(cardsWithPlaceholderImages, function (index, value) {
                out += "<li style='color:red'>" + value.title + "</li>";
            });
            out += "</ul>";
        }

        var fixedViaExceptions = $.grep(mainOut, function (card, index) { return card.fixedViaException === true; });
        if (fixedViaExceptions.length > 0) {
            out += "<p>The following cards have been fixed via exceptions:</p><ul>";
            fixedViaExceptions = fixedViaExceptions.sort(sortByTitle);
            $.each(fixedViaExceptions, function (index, card) {
                var comment = "";
                if (card._comment) {
                    comment = "<em> - " + card._comment + "</em>";
                }
                out += "<li style='color:green'>" + card.title + comment + "</li>";
            });
            out += "</ul>";
        }

        var addedViaExceptions = $.grep(mainOut, function (card, index) { return card.addedViaException === true; });
        if (addedViaExceptions.length > 0) {
            out += "<p>The following cards have been added via exceptions:</p><ul>";
            addedViaExceptions = addedViaExceptions.sort(sortByTitle);
            $.each(addedViaExceptions, function (index, card) {
                var comment = "";
                if (card._comment) {
                    comment = "<em> - " + card._comment + "</em>";
                }
                out += "<li style='color:green'>" + card.title + comment + "</li>";
            });
            out += "</ul>";
        }

        if (jsonExceptions !== undefined && jsonExceptions.length > 0) {
            var deletedViaExceptions = $.grep(jsonExceptions, function (ex, index) { return ex.matchTitle === "delete card" && ex.wasUsed === true; });
            if (deletedViaExceptions.length > 0) {
                out += "<p>The following cards have been <strong style='color:red'>deleted</strong> via exceptions:</p><ul>";
                deletedViaExceptions = deletedViaExceptions.sort(sortByTitle);
                $.each(deletedViaExceptions, function (index, ex) {
                    var comment = "";
                    if (ex._comment) {
                        comment = "<em> - " + ex._comment + "</em>";
                    }
                    out += "<li style='color:green'>" + ex.newValues.title + comment + "</li>";
                });
                out += "</ul>";
            }

            // report any unused or redundant exceptions so we can clean up the exceptions file
            var unusedExceptions = [];
            $.each(jsonExceptions, function (index, ex) {
                if (ex.hasOwnProperty("title")) { // no title means it was probably just a comment
                    if (!ex.hasOwnProperty("wasUsed") || ex.wasUsed === false) {
                        console.log('Marking ' + ex.title + ' as NEVER used.');
                        unusedExceptions.push("'" + ex.title + "' was never used");
                    }
                    if (ex.hasOwnProperty("redundantValues")) {
                        $.each(ex.redundantValues, function (prop, newVal) {
                            unusedExceptions.push("'" + ex.title + "'." + prop + ":" + newVal + " --- is redundant");
                        });
                    }
                }
            });
            if (unusedExceptions.length > 0) {
                out += "<p>The following exceptions are not used/redundant:</p><ul>";
                $.each(unusedExceptions, function (index, ex) {
                    out += "<li style='color:red'>" + ex + "</li>";
                });
                out += "</ul>";
            }
        }

        my.trigger('log-complete', out);

        // Final JSON output -------------------------------------------------------------------------------------------------

        // clean our temporary data out of the final card data
        $(mainOut).each(function (index, card) {
            delete card.matchTitle;
            delete card.srcOriginal;
            delete card.imageSourceOriginal;
            delete card.fixedViaException;
            delete card.imageSource;
        });

        var jsonMainStr = JSON.stringify(mainOut, null, ' ');

        my.trigger('data-processing-complete', jsonMainStr, initialCardDataCount, imageDataCount, mainOut.length);
    }

    // Create a sanitized title to avoid the punctuation differences
    // Site to lookup chars: http://www.fileformat.info/info/unicode/char/search.htm
    function createMatchTitle(title) {
        var clean = title.trim().replace(/\u00C6/g, 'ae').toLowerCase(); // \u00C6 = Æ = LATIN CAPITAL LETTER AE
        clean = clean.replace(/\+/g, ' '); // GM uses names like "Catch+Release" with no space
        clean = clean.replace(/[^a-z0-9 �]+/g, '');
        clean = clean.replace(/ +/, ' ');
        return clean;
    }

    function addMatchTitles(itemArray) {
        if (itemArray !== undefined) {
            $.each(itemArray, function (index, item) {
                if (item.hasOwnProperty('title')) {
                    item.matchTitle = createMatchTitle(item.title);
                }
            });
        }
        return itemArray;
    }

    /* NOTE: these colours and rarities are duplicated in the mtg-generator.js files. If you change this here you must change it in those files. */
    var colours = {
        white: { sorder: 1, code: 'w', name: 'White' },
        blue: { sorder: 2, code: 'u', name: 'Blue' },
        black: { sorder: 3, code: 'b', name: 'Black' },
        red: { sorder: 4, code: 'r', name: 'Red' },
        green: { sorder: 5, code: 'g', name: 'Green' },
        multicolour: { sorder: 6, code: 'm', name: 'Multicolour' },
        artifact: { sorder: 17, code: 'a', name: 'Artifact', colourless: true },
        land: { sorder: 27, code: 'l', name: 'Land', colourless: true },
        colorless: { sorder: 30, code: 'c', name: 'Colourless', colourless: true },
        other: { sorder: 37, code: 'o', name: 'Other: Token/Pack-In/Marketing', colourless: true },
        unknown: { sorder: 97, code: '?', name: 'Unknown Colour', colourless: true },
    };

    function getColourByCode(code) {
        for (var colour in colours) {
            if (colours[colour].code == code) {
                return colours[colour];
            }
        }
        return colours.unknown;
    }

    var rarities = {
        common: { sorder: 1, code: 'c', name: 'Common' },
        uncommon: { sorder: 2, code: 'u', name: 'Uncommon' },
        rare: { sorder: 3, code: 'r', name: 'Rare' },
        mythic: { sorder: 4, code: 'm', name: 'Mythic Rare' },
        special: { sorder: 5, code: 's', name: 'Special' },
        unknown: { sorder: 97, code: '?', name: 'Unknown' },
    };

    function getRarityByCode(code) {
        for (var rarity in rarities) {
            if (rarities[rarity].code == code) {
                return rarities[rarity];
            }
        }
        return rarities.unknown;
    }

    function sortByTitle(a, b) {
        var aName = createMatchTitle(a.title);
        var bName = createMatchTitle(b.title);
        return ((aName < bName) ? -1 : ((aName > bName) ? 1 : 0));
    }

    function isBadResponse(response) {
        if (response == null) { return true; }
        if (response.hasOwnProperty('cards')) { return false; }
        //if (!response.indexOf) { return true; } // not sure what this was ever testing for
        if (response.indexOf('ERROR') == 0 || response.indexOf('HTTP/1.1 301') == 0) { return true; }
        if (response.indexOf("The resource you are looking for has been removed, had its name changed, or is temporarily unavailable.") > -1) { return true; }
        if (response.indexOf('CopperDog - Design::Web::Programming') > -1) { return true; } // we load copper-dog.com if there's a blank entry
        if (response.indexOf("404 Not Found") > -1) { return true; }
        return false;
    }

    //from: http://stackoverflow.com/questions/10073699/pad-a-number-with-leading-zeros-in-javascript
    // example usage
    //	pad(10, 4);      // 0010
    //	pad(9, 4);       // 0009
    //	pad(123, 4);     // 0123
    //	pad(10, 4, '-'); // --10
    function pad(n, width, z) {
        z = z || '0';
        n = n + '';
        return n.length >= width ? n : new Array(width - n.length + 1).join(z) + n;
    }

    // adapted from: http://guegue.net/friendlyURL_JS
    function cardTitleUrl(str, max) {
        if (max === undefined) max = 32;
        var a_chars = new Array(
          new Array("a", /[áàâãªÁÀÂÃ]/g),
          new Array("e", /[éèêÉÈÊ]/g),
          new Array("i", /[íìîÍÌÎ]/g),
          new Array("o", /[òóôõºÓÒÔÕ]/g),
          new Array("u", /[úùûÚÙÛ]/g),
          new Array("c", /[çÇ]/g),
          new Array("n", /[Ññ]/g)
        );
        // Replace vowel with accent without them
        for (var i = 0; i < a_chars.length; i++) {
            str = str.replace(a_chars[i][1], a_chars[i][0]);
        }
        // first replace whitespace by +, second remove repeated + by just one,
        // third delete all chars which are not between a-z or 0-9, fourth trim the string and
        // the last step truncate the string to 32 chars
        return str.replace(/\s+/gi, '~').replace(/[^a-z0-9\~]/gi, '').replace(/\-{2,}/gi, '~').replace(/~/gi, '%20').replace(/(^\s*)|(\s*$)/gi, '').substr(0, max);
    }

    function getCardColourFromCard(card) {
        // derived from casting cost
        var cardColours = card.cost.toLowerCase().replace(/{|[0-9]/g, "").replace(/}/g, " ").trim().split(" ");
        var arrayUnique = function (a) {
            return a.reduce(function (p, c) {
                if (p.indexOf(c) < 0) p.push(c);
                return p;
            }, []);
        };
        var uniqueColours = arrayUnique(cardColours);
        var uniqueColoursString = uniqueColours.join('');

        var colourCount = 0;
        var uniqueColourIndex = 0; // used only if the card ends up being single colour
        var uniqueColourType = ""; // used only if the card ends up being single colour
        if (uniqueColoursString.indexOf('w') > -1) { colourCount++; uniqueColourIndex = 1; uniqueColourType = "w"; }
        if (uniqueColoursString.indexOf('u') > -1) { colourCount++; uniqueColourIndex = 2; uniqueColourType = "u"; }
        if (uniqueColoursString.indexOf('b') > -1) { colourCount++; uniqueColourIndex = 3; uniqueColourType = "b"; }
        if (uniqueColoursString.indexOf('r') > -1) { colourCount++; uniqueColourIndex = 4; uniqueColourType = "r"; }
        if (uniqueColoursString.indexOf('g') > -1) { colourCount++; uniqueColourIndex = 5; uniqueColourType = "g"; }

        // colourTypes from GatheringMagic:
        //	w = white
        //	u = blue
        //	b = black
        //	r = red
        //	g = green
        //	m = multi-colour
        //	c = colourless
        var finalColour = '';
        switch (colourCount) {
            case 0:
                // colourless - determine sub-type
                if (card.colour == 'c') {
                    var cardType = card.type.toLowerCase();
                    // manually determine colour because GM didn't do it
                    if (cardType.indexOf('artifact') > -1) {
                        finalColour = colours.artifact.code;
                    }
                    else if (cardType.indexOf('land') > -1) {
                        finalColour = colours.land.code;
                    }
                    else {
                        console.log('Could not identify colour from GM "' + card.colour + '" on card: ' + card.title + '. Set to Other Colourless. Usually check the type (which we have already checked to be not artifact or land): ' + card.type);
                        finalColour = colours.colorless.code;
                    }
                }
                else {
                    var nativeCardColour = '';
                    if (card.hasOwnProperty('colour')) {
                        nativeCardColour = card.colour;
                    }
                    else if (card.hasOwnProperty('color')) {
                        nativeCardColour = card.color; // I made this one up.. does anything have this?
                    }
                    else if (card.hasOwnProperty('colorIdentity') && card.colorIdentity.length > 0) {
                        nativeCardColour = card.colorIdentity[0].toLowerCase(); // mtgjson if casting cost is 0
                    }
                    finalColour = getColourByCode(nativeCardColour).code; // should result in a, l, o, or ?
                }
                break;
            case 1: // single-colour, as determined above
                finalColour = uniqueColourType;
                break;
            default: // multi-colour
                finalColour = colours.multicolour.code;
                break;
        }
        return finalColour;
    }

    my.getDownloadSettingsFileLinkAttributes = function (setCode, cardDataUrl, imagesUrl, exceptionsUrl) {
        var settings = {
            "setCode": setCode,
            "cardDataUrl": cardDataUrl,
            "imagesUrl": imagesUrl,
            "exceptionsUrl": exceptionsUrl
        }

        var settingsJson = JSON.stringify(settings, null, ' ');
        var encodedContent = $.base64.encode(settingsJson);

        var attrs = {
            "href": 'data:text/octet-strea; m;base64,' + encodedContent,
            "download": 'import-settings.json' // 'download' attr is Chrome/FF-only to set download filename
        }
        return attrs;
    }

    my.setSettings = function (settings) {
        // support the old settings file format
        if (settings.cardDataUrl === undefined && settings.hasOwnProperty('gatheringMagicUrl')) {
            settings.cardDataUrl = settings.gatheringMagicUrl;
        }
        if (settings.hasOwnProperty('mtgJson')) {
            settings.cardDataUrl = settings.mtgJson;
        }
        return settings;
    }

    function getCardData(cardData, cardDataUrlSource, setCode) {
        var cards = [];

        // Determine from where the card data was sourced and therefore the parser needed.
        var lowercaseCardDataUrlSource = cardDataUrlSource.toLowerCase();
        if (lowercaseCardDataUrlSource.indexOf('gatheringmagic.com') > -1) {
            cards = my.api.getCardsFromGatheringMagicData(cardData, setCode);
        }
        else if (lowercaseCardDataUrlSource.indexOf('mtgjson.com') > -1) {
            cards = my.api.getCardsFromMtgJsonData(cardData, setCode);
        }
        else {
            throw new Error("Card data url unknown. Only gatheringmagic.com and mtgjson.com supported. '" + cardDataUrlSource + "'");
        }

        return cards;
    }

    function getCardsFromGatheringMagicData(rawCardData, setCode) {
        var cards = [];

        // get all GM cards (or at least the mtgJson cards have to exist)
        var $html = $(rawCardData);
        var $cards = $html.find('.spoiler-card');
        if ($cards.length === 0) {
            alert("No cards from Gathering Magic found. Note that you CANNOT run this thing locally. It won't work. It needs to run through the proxy to work.");
        }
        $.each($cards, function (index, el) {
            var card = {};
            el = $(el);

            var title = el.find('.title');
            if (title.length > 0) {
                card.title = title[0].textContent.trim();
                card.matchTitle = createMatchTitle(card.title); // used for matching Gathering Magic vs. WotC titles and card titles vs. exception titles
                var img = $(title).find('.thickbox');
                if (img.length > 0) {
                    card.src = img[0].href;
                    card.imageSource = "gatheringmagic";
                    if (el.hasClass('wm-day') || el.hasClass('wm-night')) { // Double-Faced card
                        card.width = 536;
                    }
                }
            }

            card.set = setCode;

            card.cost = "";
            el.find('.cost img').each(function (index, value) {
                card.cost += $(value).attr('alt');
            });

            var rarity = el.find('.rarity');
            if (rarity.length > 0) {
                card.rarity = rarity[0].textContent[0].toLowerCase();
            }

            var type = el.find('.type');
            if (type.length > 0) {
                var types = type[0].textContent.split(' – ');
                card.type = types[0].trim();
                if (types.length > 1) {
                    card.subtype = types[1].trim();
                }
            }

            var pt = el.find('.powtou');
            if (pt.length > 0) {
                var pts = pt[0].textContent.split('/');
                if (pts.length > 1) {
                    card.power = pts[0].trim();
                    card.toughness = pts[1].trim();
                }
                else if (pts.length == 1) {
                    card.loyalty = pts[0].replace('[', '').replace(']', '').trim(); // must be a planeswalker
                }
                // otherwise it's something without power/toughness|loytlty, i.e.: land, spell, etc
            }

            if (el[0].classList.length > 1) {
                card.colour = el[0].classList[1][0];
            }

            // derived from casting cost
            card.colour = getCardColourFromCard(card);

            var cnum = el.find('.cardnum');
            if (cnum.length > 0) {
                var cnums = cnum[0].textContent.split('/');
                if (cnums.length > 1) {
                    card.num = pad(cnums[0].trim(), 3);
                }
            }

            // if it has a guild or clan, save that
            $(el[0].classList).each(function (index, value) {
                if (value.indexOf('wm-') == 0) {
                    if (guildClanType === undefined) {
                        switch (setCode.toLowerCase()) {
                            case "rtr": // Guilds: Return to Ravniva, Gatecrash, Dragon's Maze
                            case "gtc":
                            case "dgm":
                                guildClanType = "guild";
                                break;

                            case "ktk": // Clans: Khans of Tarkir, Fate Reforged, Dragons of Tarkir
                            case "frf":
                            case "dtk":
                                guildClanType = "clan";
                                break;
                        }
                    }
                    if (guildClanType !== undefined) {
                        card[guildClanType] = value.replace('wm-', '').replace('//', '/');
                    }
                    else {
                        console.log("WARNING: found wm-* class data in GM HTML but set code doesn't belong to anything with guilds/clans.");
                    }
                }
            });

            cards.push(card);
        });

        return cards;
    }

    function getCardsFromMtgJsonData(rawCardData, setCode) {
        var cards = [];

        rawCardData = JSON.parse(rawCardData);

        if (rawCardData === undefined || !rawCardData.hasOwnProperty('cards')) {
            alert("Missing card data from mtgjson.com. Note that you CANNOT run this thing locally. It won't work. It needs to run through the proxy to work.");
        }
        if (rawCardData.cards.length < 1) {
            alert("No cards from mtgjson.com found. Note that you CANNOT run this thing locally. It won't work. It needs to run through the proxy to work.");
        }

        // add each card, converting from mtgjson.com's format to our own
        $.each(rawCardData.cards, function (index, card) {
            //console.log('converting: ' + card.name);
            card.title = card.name;
            card.matchTitle = createMatchTitle(card.title); // used for matching Gathering Magic vs. WotC titles and card titles vs. exception titles
            card.set = setCode;
            card.cost = card.manaCost || '';
            card.rarity = card.rarity.substr(0, 1).toLowerCase();
            if (card.hasOwnProperty("types") && card.types.length > 0) {
                card.type = card.types[0];
            }
            else {
                card.type = card.type;
            }
            if (card.hasOwnProperty('subTypes') && card.subTypes.length > 0) {
                card.subtype = card.subtypes[0];
            }
            card.colour = getCardColourFromCard(card);
            card.num = card.number;
            card.src = "http://gatherer.wizards.com/Handlers/Image.ashx?multiverseid=" + card.multiverseid + "&type=card";
            card.imageSource = "mtgJson";

            // Adjust some of mtgJSON's format to our own:
            // Change their type from Land to Basic Land
            if (card.matchTitle === 'plains' || card.matchTitle === 'forest' || card.matchTitle === 'swamp' || card.matchTitle === 'island' || card.matchTitle === 'mountain') {
                card.type = "Basic Land";
                card.colour = "l";
            }
            if (card.hasOwnProperty('layout') && card.layout === 'token') {
                card.token = true;
            }
            if (card.hasOwnProperty('type') && card.type === 'Land') {
                card.colour = "l";
            }
            if (card.hasOwnProperty('type') && card.type === 'Artifact') {
                card.colour = "a";
                card.sorder = 17;
                card.colourless = true;
            }
            if (card.hasOwnProperty('watermark') && (card.set === 'som' || card.set === 'mbs' || card.set === 'nph')) {
                card.faction = card.watermark;
            }

            cards.push(card);
        });

        return cards;
    }

    function getImageData(imageData, imageDataUrlSource) {
        var images = [];

        // Determine from where the image data was sourced and therefore the parser needed.
        var lowercaseImageDataUrlSource = imageDataUrlSource.toLowerCase();
        if (lowercaseImageDataUrlSource.indexOf('magic.wizards.com') > -1) {
            images = getImagesFromWotcSpoilers(imageData);
        }
        else if (lowercaseImageDataUrlSource.indexOf('archive.wizards.com') > -1) {
            images = getImagesFromWotcArchive(imageData);
        }
        else if (lowercaseImageDataUrlSource.indexOf('mtgjson.com') > -1) {
            images = getImagesFromMtgJsonData(imageData);
        }
        else if (lowercaseImageDataUrlSource.indexOf('cardsmain.json') > -1) {
            images = getImagesFromCardsMainData(imageData);
        }
        else {
            alert("Image data url unknown. Only magic.wizards.com, gatheringmagic.com, and cardsMain.json supported. '" + htmlImages.urlSource + "'");
        }

        return images;
    }

    function getImagesFromWotcSpoilers(rawHtmlImageData) {
        var image;
        var finalImages = [];

        var $images = $(rawHtmlImageData);

        // v4 - 20150305, dtk gallery -- hard to scan as anything unique is added by js
        if (finalImages.length < 1) {
            var $rawimages = $images.find('#content-detail-page-of-an-article img');
            if ($rawimages.length > 0) {
                var $imageContainer, $cardTitle;
                $rawimages.each(function (index, img) {
                    $imageContainer = $(img).parent();
                    $cardTitle = $imageContainer.find("i");
                    if ($cardTitle.length === 1) {
                        image = {};
                        image.title = $cardTitle.text().trim();
                        image.matchTitle = createMatchTitle(image.title);
                        image.src = img.src;
                        finalImages[image.matchTitle] = image;
                    }
                });
            }
        }

        // v3 - 20140901, ktk gallery -- hard to scan as anything unique is added by js
        if (finalImages.length < 1) {
            var $rawimages = $images.find('img.noborder');
            if ($rawimages.length > 0) {
                var $imageContainer, $cardTitle;
                $rawimages.each(function (index, img) {
                    $imageContainer = $(img).parent();
                    $cardTitle = $imageContainer.find("i");
                    if ($cardTitle.length === 1) {
                        image = {};
                        image.title = $cardTitle.text().trim();
                        image.matchTitle = createMatchTitle(image.title);
                        image.src = img.src;
                        finalImages[image.matchTitle] = image;
                    }
                });
            }
        }

        // v2 - 2014 site redesign, m15 gallery
        if (finalImages.length < 1) {
            $rawimages = $images.find('.advanced-card-gallery-container img[alt]');
            if ($rawimages.length > 0) {
                $rawimages.each(function (index, value) {
                    image = {};
                    image.title = value.alt.trim();
                    image.matchTitle = createMatchTitle(image.title);
                    image.src = value.src;
                    finalImages[image.matchTitle] = image;
                });
            }
        }

        // v1 - original wotc site
        if (finalImages.length < 1) {
            var $rawimages = $images.find('img[alt].article-image');
            if ($rawimages.length > 0) {
                $rawimages.each(function (index, value) {
                    image = {};
                    image.title = value.alt.trim();
                    image.matchTitle = createMatchTitle(image.title);
                    image.src = value.src;
                    finalImages[image.matchTitle] = image;
                });
            }
        }

        finalImages.forEach(function (image) {
            image.imageSource = "wotc-spoilers";
        });

        return finalImages;
    }

    function getImagesFromWotcArchive(rawHtmlImageData) {
        var image;
        var finalImages = [];

        var $images = $(rawHtmlImageData);

        var $rawimages = $images.find('.article-image');
        if ($rawimages.length > 0) {
            var $imageContainer, $cardTitle;
            $rawimages.each(function (index, img) {
                var enLoc = img.src.indexOf('/EN/');
                if (enLoc > -1) {
                    var imgNum = img.src.substr(enLoc + 4, 4);
                    var num = parseInt(imgNum);
                    if (!isNaN(num)) {
                        image = {};
                        image.src = img.src;
                        var thisHostStartIndex = image.src.indexOf("/mtg/images/");
                        if (thisHostStartIndex > 0) {
                            image.src = "http://archive.wizards.com" + image.src.substr(thisHostStartIndex);
                        }
                        image.num = num;
                        finalImages[image.num] = image;
                    }
                }
            });
        }

        finalImages.forEach(function (image) {
            image.imageSource = "wotc-archive";
        });

        return finalImages;
    }

    function getImagesFromMtgJsonData(rawImageData) {
        var image;
        var finalImages = [];

        if (rawImageData === undefined || !rawImageData.hasOwnProperty('cards')) {
            alert("Missing image data from mtgjson.com. Note that you CANNOT run this thing locally. It won't work. It needs to run through the proxy to work.");
        }
        if (rawImageData.cards.length < 1) {
            alert("No images from mtgjson.com found. Note that you CANNOT run this thing locally. It won't work. It needs to run through the proxy to work.");
        }

        // add each card, converting from mtgjson.com's format to our own
        $.each(rawImageData.cards, function (index, card) {
            image = {};
            image.title = card.name;
            image.matchTitle = createMatchTitle(image.title);
            image.src = "http://gatherer.wizards.com/Handlers/Image.ashx?multiverseid=" + card.multiverseid + "&type=card";
            image.imageSource = "mtgjson";
            finalImages[image.matchTitle] = image;
        });

        return finalImages;
    }

    function getImagesFromCardsMainData(rawImageData) {
        var image;
        var finalImages = [];

        if (rawImageData === undefined) {
            alert("Missing image data from cardsMain.json. Note that you CANNOT run this thing locally. It won't work. It needs to run through the proxy to work.");
            return finalImages;
        }
        if (rawImageData.length < 1) {
            alert("No images from mtgjson.com found. Note that you CANNOT run this thing locally. It won't work. It needs to run through the proxy to work.");
            return finalImages;
        }

        $.each(rawImageData, function (index, card) {
            image = {};
            image.title = card.title;
            image.matchTitle = createMatchTitle(image.title);
            image.src = card.src;
            image.imageSource = "cardsMain.json";
            finalImages[image.matchTitle] = image;
        });

        return finalImages;
    }

    function applyPropertyExceptions(cards, exceptions) {
        // apply the exceptions if there are any
        // DUPLICATED above (the above one is lesser; this is the real one)
        $.each(cards, function (index, card) {
            if (exceptions != null && exceptions.length > 0) {
                $.each(exceptions, function (index, ex) {
                    /*
                     the old format is:
                     ,{
                      "gmTitle": "Wild Beastmistress",
                      "wotcTitle": "Wild Beastmaster",
                      "finalTitle": "Wild Beastmaster"
                     }
                     we'll keep supporting this one for backwards compatability (FOR NOW)
                    */
                    // rename each gmTitle match to the wotcTitle
                    if (ex.hasOwnProperty('gmTitle')) {
                        if (card.title == ex.gmTitle) {
                            // add all Exception properties into the card for posterity
                            $.extend(card, ex);
                            ex.wasUsed = true;

                            if (ex.wotcTitle) {
                                card.originalTitle = card.title;
                                if (card.title == ex.wotcTitle) {
                                    if (!ex.hasOwnProperty("redundantValues")) {
                                        ex.redundantValues = {};
                                    }
                                    ex.redundantValues.wotcTitle = ex.wotcTitle;
                                }
                                card.title = ex.wotcTitle;
                                card.matchTitle = createMatchTitle(card.title); // used for sorting final output
                                card.fixedViaException = true;
                            }
                        }
                    }
                    /*
                     the new format is:
                     ,{
                      "title": "Grave Betrayal",
                      "newValues": { "type": "Enchantment"}
                     },
                    {
                        "title": "Add New Card",
                        "newValues": {
                            "title": "Vendilion Clique",
                            "src": "http://media.wizards.com/2015/mm2_9vgauji43t9a/en_4sRXIOzwPJ.png",
                            "set": "mm2",
                            "cost": "{1}{U}{U}",
                            "rarity": "m",
                            "type": "Legendary Creature",
                            "subtype": "Faerie Wizard",
                            "power": "3",
                            "toughness": "1",
                            "colour": "u",
                            "num": "067"
                        }
                    },
                    {
                        "title": "Delete Card",
                        "newValues": {
                            "title": "Aegis Angel"
                        }
                    }
                    */
                    var exCard;
                    if (ex.hasOwnProperty('matchTitle')) {
                        if (card.matchTitle === ex.matchTitle) {
                            console.log('Found exception match for:' + card.matchTitle);
                            if (ex.hasOwnProperty('newValues')) {
                                console.log('Has newValues:' + card.matchTitle);
                                // check each exception; if it wasn't necessary record it so we can clean up the exception file
                                if (card.matchTitle !== "add new card") {
                                    $.each(ex.newValues, function (prop, newVal) {
                                        if (card.hasOwnProperty(prop) && card[prop] === newVal) {
                                            console.log('Exception property already exists on card:' + card.matchTitle);
                                            if (!ex.hasOwnProperty("redundantValues")) {
                                                ex.redundantValues = {};
                                            }
                                            ex.redundantValues[prop] = newVal;
                                        }
                                    });
                                }

                                // add all Exception properties into the card for posterity
                                $.extend(card, ex.newValues);
                                ex.wasUsed = true;
                                console.log('Marking ' + ex.title + ' as used.');
                                card.matchTitle = createMatchTitle(card.title); // redo the matchTitle in case we just fixed the title
                                card.fixedViaException = true;
                            }
                        }
                    }
                });
            }

        });// done processing exceptions

        return cards;
    }

    function applyAdditionDeletionExceptions(cards, exceptions) {
        // see if there are any Add New Card or Deleted Card cards and add those
        if (exceptions !== undefined) {
            var cardsToDelete = [];
            $.each(exceptions, function (index, ex) {
                if (ex.matchTitle === "add new card") {
                    // add all Exception properties into the card
                    var card = {};
                    $.extend(card, ex.newValues);
                    ex.wasUsed = true;
                    console.log('Marking ' + ex.title + ' as used.');
                    card.matchTitle = createMatchTitle(card.title); // redo the matchTitle in case we just fixed the title
                    card.fixedViaException = true;
                    card.addedViaException = true;
                    cards.push(card);
                }
                else if (ex.matchTitle === "delete card") {
                    console.log('Card flagged for deletion:' + ex.newValues.title);
                    cardsToDelete.push(createMatchTitle(ex.newValues.title));
                    ex.wasUsed = true; // marking it true even though I'm not sure if it's used -- that's hard and I don't care right now
                }
            });

            // if there are any cards flagged for deletion, delete them
            if (cardsToDelete.length > 0) {
                var cardsToKeep = [];
                $.each(cards, function (index, card) {
                    if (cardsToDelete.indexOf(card.matchTitle) === -1) {
                        cardsToKeep.push(card);
                    }
                    else {
                        console.log('Deleted card:' + card.title);
                    }
                });
                cards = cardsToKeep;
            }
        }

        return cards;
    }

    function applyImagesToCards(cards, images) {
        if (images !== undefined) {
            $.each(cards, function (index, card) {
                var image = images[card.matchTitle];

                // archive.wizards.com images have no titles; they're indexed by image
                if (image === undefined) {
                    image = images[card.num];
                }

                if (image !== undefined) {
                    card.srcOriginal = card.src;
                    card.imageSourceOriginal = card.src;
                    card.src = image.src;
                    card.imageSource = image.imageSource;
                    image.wasUsed = true;
                }
            });
        }

        // if no image found at all at this point, create replacement card
        $.each(cards, function (index, card) {
            if (!card.src) {
                card.imageSource = "placeholder";
                card.src = createPlaceholderCardSrc(card);
            }
        });

        return cards;
    }

    function createPlaceholderCardSrc(card) {
        var cardBgColour = "cccccc";
        var cardTextColour = "969696";
        switch (card.colour) {
            case 'w': cardBgColour = 'e9e5da'; break;
            case 'u': cardBgColour = 'cddfed'; break;
            case 'b': cardBgColour = '000000'; cardTextColour = 'ffffff'; break;
            case 'r': cardBgColour = 'f6d1be'; break;
            case 'g': cardBgColour = 'c7d4ca'; break;
        }
        return "holder.js/265x370/#" + cardBgColour + ":#" + cardTextColour + "/text:" + cardTitleUrl(card.title, 500);
    }

    function createPlaceboxesCardSrc(card) {
        var cardBgColour = "cccccc";
        var cardTextColour = "969696";
        switch (card.colourType) {
            case 'w': cardBgColour = 'e9e5da'; break;
            case 'u': cardBgColour = 'cddfed'; break;
            case 'b': cardBgColour = '000000'; cardTextColour = 'ffffff'; break;
            case 'r': cardBgColour = 'f6d1be'; break;
            case 'g': cardBgColour = 'c7d4ca'; break;
        }
        return "http://placebox.es/265x370/" + cardBgColour + "/" + cardTextColour + "/" + cardTitleUrl(card.title, 500) + ",20/";
    }

    Object.size = function (obj) {
        var size = 0, key;
        for (key in obj) {
            if (obj.hasOwnProperty(key)) size++;
        }
        return size;
    };

    function createMrPurpleCardSrc(card) {
        var url = "http://magic.mrpurple.de/";
        if (card.type == 'Planeswalker') {
            url += "Planeswalker/server-side.php?Titel=" + card.title + "&Type=" + card.type;
            if (card.loyalty) { url += '&loyalty=' + card.loyalty; }
        }
        else {
            url += "Card/modern.php?style=modern.php&Titel=" + card.title + "&Type=" + card.type;
        }

        url += '&Color=';
        switch (card.colour) {
            case colours.multicolour:
                url += 'Multicolor';
                break;
            case colours.other:
            case colours.unknown:
                url += 'Colorless';
                break;
            default:
                url += getColourByCode(card.colour).name;
                break;
        }

        url += '&Rarity=' + getRarityByCode(card.rarity).name.replace("Mythic Rare", "Mythic", "gi");
        if (card.subtype) { url += '&Subtype=- ' + card.subtype; }
        if (card.power) { url += '&Power=' + card.power; }
        if (card.toughness) { url += '&Toughness=' + card.toughness; }

        if (card.cost) {
            var wCount = 0;
            var uCount = 0;
            var bCount = 0;
            var rCount = 0;
            var gCount = 0;
            var cCount = 0;
            var colourCosts = card.cost.toLowerCase().replace(/{/g, "").replace(/}/g, " ").trim().split(" ");
            for (var i in colourCosts) {
                switch (colourCosts[i]) {
                    case 'w': wCount++; break;
                    case 'u': uCount++; break;
                    case 'b': bCount++; break;
                    case 'r': rCount++; break;
                    case 'g': gCount++; break;
                    default: cCount += parseInt(colourCosts[i]); break;
                }
            }
            if (wCount > 0) { url += "&manawhite=" + wCount; }
            if (uCount > 0) { url += "&manablue=" + uCount; }
            if (bCount > 0) { url += "&manablack=" + bCount; }
            if (rCount > 0) { url += "&manared=" + rCount; }
            if (gCount > 0) { url += "&managreen=" + gCount; }
            if (cCount > 0) { url += "&manacolless=" + cCount; }
        }

        return url;
    }

    // set of internal function calls for testing purposes
    my.api = {
        createOutputJson: createOutputJson,

        getCardData: getCardData,
        getCardsFromGatheringMagicData: getCardsFromGatheringMagicData,
        getCardsFromMtgJsonData: getCardsFromMtgJsonData,

        getImageData: getImageData,
        getImagesFromWotcSpoilers: getImagesFromWotcSpoilers,
        getImagesFromMtgJsonData: getImagesFromMtgJsonData,
        getImagesFromCardsMainData: getImagesFromCardsMainData,

        applyPropertyExceptions: applyPropertyExceptions,
        applyAdditionDeletionExceptions: applyAdditionDeletionExceptions,
        applyImagesToCards: applyImagesToCards
    };

    return my;
}(cardDataImporter || {}, jQuery));