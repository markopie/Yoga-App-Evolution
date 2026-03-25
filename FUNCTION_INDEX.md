# 🗺️ Application Architecture & Function Index

> *Auto-generated map of all exported modules in the project.*

### 📄 `playback/audioEngine.js`
- `getCurrentAudio` (function)
- `setCurrentAudio` (function)
- `playFaintGong` (function)
- `detectSide` (function)
- `playSideCue` (function)
- `playAsanaAudio` (function)
- `playPoseMainAudio` (function)

### 📄 `playback/timer.js`
- `PlaybackEngine` (class)
- `playbackEngine` (const)

### 📄 `services/dataAdapter.js`
- `fetchCourses` (module export)
- `loadAsanaLibrary` (module export)
- `normalizeAsana` (module export)
- `normalizeAsanaRow` (module export)
- `normalizePlate` (module export)
- `parsePlates` (module export)
- `normaliseAsanaId` (module export)
- `findAsanaByIdOrPlate` (module export)

### 📄 `services/historyService.js`
- `safeGetLocalStorage` (function)
- `safeSetLocalStorage` (function)
- `loadCompletionLog` (function)
- `saveCompletionLog` (function)
- `addCompletion` (function)
- `lastCompletionFor` (function)
- `seedManualCompletionsOnce` (function)
- `fetchServerHistory` (function)
- `appendServerHistory` (function)
- `updateCompletionRating` (function)
- `deleteCompletionById` (function)
- `deleteAllCompletionsForTitle` (function)
- `calculateStreak` (function)
- `toggleHistoryPanel` (function)
- `COMPLETION_KEY` (module export)

### 📄 `services/http.js`
- `loadJSON` (module export)

### 📄 `services/persistence.js`
- `getOrCreateSubCategoryId` (function)
- `saveSequence` (function)
- `getOrCreateAsanaCategoryId` (function)

### 📄 `services/sequenceEngine.js`
- `getExpandedPoses` (function)

### 📄 `services/supabaseClient.js`
- `supabase` (const)

### 📄 `store/builderState.js`
- `builderState` (const)
- `isFlowSequence` (function)
- `setBuilderState` (function)
- `movePoseToIndex` (function)
- `movePose` (function)
- `removePose` (function)
- `addPoseToBuilder` (function)
- `toggleSanskrit` (function)
- `clearAmbiguity` (function)

### 📄 `store/state.js`
- `globalState` (const)
- `setCourses` (function)
- `setSequences` (function)
- `setAsanaLibrary` (function)
- `setPlateGroups` (function)
- `setServerAudioFiles` (function)
- `setIdAliases` (function)
- `setActivePlaybackList` (function)
- `setCurrentSequence` (function)
- `setCurrentIndex` (function)
- `setCurrentAudio` (function)
- `setCurrentSide` (function)
- `setNeedsSecondSide` (function)
- `getCourses` (function)
- `getSequences` (function)
- `getAsanaLibrary` (function)
- `getActivePlaybackList` (function)
- `getCurrentSequence` (function)
- `getCurrentIndex` (function)
- `getCurrentSide` (function)
- `getNeedsSecondSide` (function)

### 📄 `ui/browse.js`
- `setupBrowseUI` (module export)
- `openBrowse` (module export)
- `closeBrowse` (module export)
- `renderBrowseList` (module export)
- `startBrowseAsana` (module export)
- `showAsanaDetail` (module export)
- `applyBrowseFilters` (module export)

### 📄 `ui/builder.js`
- `movePose` (module export)
- `removePose` (module export)
- `addPoseToBuilder` (module export)

### 📄 `ui/builderSearch.js`
- `setupBuilderSearch` (function)

### 📄 `ui/builderTemplates.js`
- `builderPoseName` (function)
- `generateVariationSelectHTML` (function)
- `buildMacroInfoHTML` (function)
- `generateInfoCellHTML` (function)
- `resolvePoseInfo` (const)

### 📄 `ui/builderUI.js`
- `updateBuilderModeUI` (function)
- `openLinkSequenceModal` (function)

### 📄 `ui/courseUI.js`
- `renderCollage` (function)
- `renderPlateSection` (function)
- `renderCategoryFilter` (function)
- `updateActiveCategoryTitle` (function)
- `renderCourseUI` (function)
- `renderSequenceDropdown` (function)

### 📄 `ui/durationDial.js`
- `getDialPosition` (function)
- `resolveDialAnchors` (function)
- `interpolateDuration` (function)
- `updateDialUI` (function)
- `applyDurationDial` (function)
- `dialReset` (function)

### 📄 `ui/historyModal.js`
- `openHistoryModal` (module export)
- `switchHistoryTab` (module export)
- `renderGlobalHistory` (module export)

### 📄 `ui/renderers.js`
- `updatePoseNote` (function)
- `updatePoseAsanaDescription` (function)
- `getContentForPose` (function)
- `updatePoseDescription` (function)
- `descriptionForPose` (function)

### 📄 `ui/statsUI.js`
- `updateTotalAndLastUI` (function)
- `refreshAllTimingUI` (function)

### 📄 `ui/themeToggle.js`
- `themeManager` (const)

### 📄 `utils/builderParser.js`
- `parseSemicolonCommand` (function)

### 📄 `utils/dom.js`
- `normaliseText` (module export)
- `$` (module export)
- `safeListen` (module export)
- `setStatus` (module export)
- `showError` (module export)
- `enterBrowseDetailMode` (module export)
- `exitBrowseDetailMode` (module export)

### 📄 `utils/format.js`
- `prefersIAST` (function)
- `setIASTPref` (function)
- `displayName` (function)
- `escapeHtml2` (function)
- `renderMarkdownMinimal` (function)
- `formatHMS` (function)
- `formatTechniqueText` (function)
- `formatCategory` (function)

### 📄 `utils/helpers.js`
- `parsePlateTokens` (function)
- `plateFromFilename` (function)
- `primaryAsanaFromFilename` (function)
- `filenameFromUrl` (function)
- `mobileVariantUrl` (function)
- `ensureArray` (function)
- `isBrowseMobile` (function)
- `smartUrlsForPoseId` (function)

### 📄 `utils/parsing.js`
- `parseHoldTimes` (module export)
- `secsToMSS` (module export)
- `buildHoldString` (module export)
- `parseSequenceText` (module export)
- `getHoldTimes` (module export)

### 📄 `utils/sequenceUtils.js`
- `extractTier` (function)
- `getEffectiveTime` (function)
- `calculateTotalSequenceTime` (function)
- `getPosePillTime` (function)

