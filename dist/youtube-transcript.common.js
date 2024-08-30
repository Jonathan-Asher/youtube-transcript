'use strict';Object.defineProperty(exports,'__esModule',{value:true});/*! *****************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */

function __awaiter(thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
}const RE_YOUTUBE = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.83 Safari/537.36,gzip(gfe)';
const RE_XML_TRANSCRIPT = /<text start="([^"]*)" dur="([^"]*)">([^<]*)<\/text>/g;
class YoutubeTranscriptError extends Error {
    constructor(message) {
        super(`[YoutubeTranscript] 🚨 ${message}`);
    }
}
class YoutubeTranscriptTooManyRequestError extends YoutubeTranscriptError {
    constructor() {
        super('YouTube is receiving too many requests from this IP and now requires solving a captcha to continue');
    }
}
class YoutubeTranscriptVideoUnavailableError extends YoutubeTranscriptError {
    constructor(videoId) {
        super(`The video is no longer available (${videoId})`);
    }
}
class YoutubeTranscriptDisabledError extends YoutubeTranscriptError {
    constructor(videoId) {
        super(`Transcript is disabled on this video (${videoId})`);
    }
}
class YoutubeTranscriptNotAvailableError extends YoutubeTranscriptError {
    constructor(videoId) {
        super(`No transcripts are available for this video (${videoId})`);
    }
}
class YoutubeTranscriptNotAvailableLanguageError extends YoutubeTranscriptError {
    constructor(langs, availableLangs, videoId) {
        super(`No transcripts are available in ${langs.join(', ')} for this video (${videoId}). Available languages: ${availableLangs.join(', ')}`);
    }
}
class YoutubeVideoMetadataNotFoundError extends YoutubeTranscriptError {
    constructor(videoPage, message) {
        if (videoPage.length > 8000)
            videoPage = videoPage.slice(0, 4000) + '...<object too long>' + videoPage.slice(-4000);
        super(`Video metadata not found. ${message}` + (videoPage ? ` (Video page: ${videoPage})` : ``));
    }
}
/**
 * Class to retrieve transcript if exist
 */
class YoutubeTranscript {
    static fetchTranscript(videoId, config, includeMetadata) {
        var _a, _b;
        return __awaiter(this, void 0, void 0, function* () {
            const identifier = this.retrieveVideoId(videoId);
            // Merge config.lang and config.langs
            const configLangs = [...((config === null || config === void 0 ? void 0 : config.lang) ? [config.lang] : []), ...((_a = config === null || config === void 0 ? void 0 : config.langs) !== null && _a !== void 0 ? _a : [])];
            const preferredLang = configLangs === null || configLangs === void 0 ? void 0 : configLangs[0];
            const videoPageResponse = yield fetch(`https://www.youtube.com/watch?v=${identifier}`, {
                headers: Object.assign(Object.assign({}, (preferredLang && { 'Accept-Language': preferredLang })), { 'User-Agent': USER_AGENT }),
            });
            const videoPageBody = yield videoPageResponse.text();
            const splittedHTML = videoPageBody.split('"captions":');
            if (splittedHTML.length <= 1) {
                if (videoPageBody.includes('class="g-recaptcha"')) {
                    throw new YoutubeTranscriptTooManyRequestError();
                }
                if (!videoPageBody.includes('"playabilityStatus":')) {
                    throw new YoutubeTranscriptVideoUnavailableError(videoId);
                }
                throw new YoutubeTranscriptDisabledError(videoId);
            }
            const captions = (_b = (() => {
                try {
                    return JSON.parse(splittedHTML[1].split(',"videoDetails')[0].replace('\n', ''));
                }
                catch (e) {
                    return undefined;
                }
            })()) === null || _b === void 0 ? void 0 : _b['playerCaptionsTracklistRenderer'];
            if (!captions) {
                throw new YoutubeTranscriptDisabledError(videoId);
            }
            if (!('captionTracks' in captions)) {
                throw new YoutubeTranscriptNotAvailableError(videoId);
            }
            // Check for available languages based on config
            let availableLanguages = configLangs.filter((lang) => captions.captionTracks.some((track) => track.languageCode === lang));
            if (configLangs.length && !availableLanguages.length) {
                throw new YoutubeTranscriptNotAvailableLanguageError(configLangs, captions.captionTracks.map((track) => track.languageCode), videoId);
            }
            const transcriptLanguage = availableLanguages[0];
            const transcriptURL = (transcriptLanguage
                ? captions.captionTracks.find((track) => track.languageCode === transcriptLanguage)
                : captions.captionTracks[0]).baseUrl;
            const transcriptResponse = yield fetch(transcriptURL, {
                headers: Object.assign(Object.assign({}, (transcriptLanguage && { 'Accept-Language': transcriptLanguage })), { 'User-Agent': USER_AGENT }),
            });
            if (!transcriptResponse.ok) {
                throw new YoutubeTranscriptNotAvailableError(videoId);
            }
            const transcriptBody = yield transcriptResponse.text();
            const results = [...transcriptBody.matchAll(RE_XML_TRANSCRIPT)];
            const finalResults = results.map((result) => ({
                text: result[3],
                duration: parseFloat(result[2]),
                offset: parseFloat(result[1]),
                lang: transcriptLanguage,
            }));
            if (includeMetadata) {
                const metaData = YoutubeTranscript.getVideoMetaData(videoPageBody);
                return { transcriptResponseArray: finalResults, videoMetadata: metaData };
            }
            return finalResults;
        });
    }
    /**
     * Retrieve video id from url or string
     * @param videoId video url or video id
     */
    static retrieveVideoId(videoId) {
        if (videoId.length === 11) {
            return videoId;
        }
        const matchId = videoId.match(RE_YOUTUBE);
        if (matchId && matchId.length) {
            return matchId[1];
        }
        throw new YoutubeTranscriptError('Impossible to retrieve Youtube video ID.');
    }
    /**
   * Fetches metadata for a YouTube video. Use this function if you want only the video's metadata without the transcript.
   *
   * @param {string} videoId - The ID of the YouTube video.
   * @return {Promise<IYoutubeVideoMetadata>} A promise that resolves with the video's metadata. hint: import { IYoutubeVideoMetadata } from 'youtube-transcript';
   */
    static fetchMetadata(videoId) {
        return __awaiter(this, void 0, void 0, function* () {
            const identifier = this.retrieveVideoId(videoId);
            const videoPageResponse = yield fetch(`https://www.youtube.com/watch?v=${identifier}`, {
                headers: {
                    'User-Agent': USER_AGENT
                },
            });
            const videoPageBody = yield videoPageResponse.text();
            if (videoPageBody.includes('class="g-recaptcha"')) {
                throw new YoutubeTranscriptTooManyRequestError();
            }
            if (!videoPageBody.includes('"playabilityStatus":')) {
                throw new YoutubeTranscriptVideoUnavailableError(videoId);
            }
            return YoutubeTranscript.getVideoMetaData(videoPageBody);
        });
    }
    /**
     * Extracts metadata from a YouTube video page as text.
     *
     * @param {string} videoPageBody - The response from the youtube video page as text. ex: response = await fetch(); videoPageBody = await response.text();
     * @return {IYoutubeVideoMetadata} The extracted metadata.
     */
    static getVideoMetaData(videoPageBody) {
        let startSplit, jsonString, jsonObject;
        try {
            startSplit = videoPageBody.split('var ytInitialPlayerResponse = ')[1];
            jsonString = startSplit.split(';</script>')[0];
        }
        catch (e) {
            let lastObj = jsonString ? jsonString : startSplit;
            if (!lastObj)
                lastObj = videoPageBody;
            throw new YoutubeVideoMetadataNotFoundError(lastObj, 'Couldnt split html by: "var ytInitialPlayerResponse = " or ";</script>"' + e.message);
        }
        //trim all the characters from the end of jsonString that are not '}'
        while (jsonString && jsonString[jsonString.length - 1] !== '}') {
            jsonString = jsonString.slice(0, -1);
        }
        try {
            jsonObject = JSON.parse(jsonString);
        }
        catch (e) {
            throw new YoutubeVideoMetadataNotFoundError(jsonString, 'Couldnt parse json, ' + e.message);
        }
        if (jsonObject.videoDetails) {
            const videoDetails = jsonObject.videoDetails;
            const res = {};
            res.creator = videoDetails.author;
            res.creatorUsername = videoDetails.channelId;
            res.title = videoDetails.title;
            res.description = videoDetails.shortDescription;
            res.length = Number(videoDetails.lengthSeconds) * 1000; //length is storedin ms
            if (jsonObject.microformat && jsonObject.microformat.playerMicroformatRenderer) {
                const microformat = jsonObject.microformat.playerMicroformatRenderer;
                res.uploadDate = new Date(microformat.uploadDate);
            }
            res.postUrl = `https://www.youtube.com/watch?v=${videoDetails.videoId}`;
            res.postId = videoDetails.videoId;
            res.videoUrl = undefined; //TODO:
            res.fullUrl = undefined;
            res.thumbnailUrl = videoDetails.thumbnail.thumbnails[0].url; //the smallest thumbnail
            res.isAd = false; //TODO: figure out how to find out if it is an ad
            res.crosspost = false; //NA in youtube
            return res;
        }
        throw new YoutubeVideoMetadataNotFoundError(jsonString, 'parsed but didnt find the video details');
    }
}exports.YoutubeTranscript=YoutubeTranscript;exports.YoutubeTranscriptDisabledError=YoutubeTranscriptDisabledError;exports.YoutubeTranscriptError=YoutubeTranscriptError;exports.YoutubeTranscriptNotAvailableError=YoutubeTranscriptNotAvailableError;exports.YoutubeTranscriptNotAvailableLanguageError=YoutubeTranscriptNotAvailableLanguageError;exports.YoutubeTranscriptTooManyRequestError=YoutubeTranscriptTooManyRequestError;exports.YoutubeTranscriptVideoUnavailableError=YoutubeTranscriptVideoUnavailableError;exports.YoutubeVideoMetadataNotFoundError=YoutubeVideoMetadataNotFoundError;