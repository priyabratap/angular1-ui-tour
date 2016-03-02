/* global angular: false, Tour: false */

(function (app) {
    'use strict';

    app.controller('TourController', ['$timeout', '$q', '$filter', 'TourConfig', 'uiTourBackdrop', function ($timeout, $q, $filter, TourConfig, uiTourBackdrop) {

        var self = this,
            stepList = [],
            currentStep = null,
            resumeWhenFound,
            statuses = {
                OFF: 0,
                ON: 1,
                PAUSED: 2
            },
            tourStatus = statuses.OFF,
            options = TourConfig.getAll();

        function digest() {
            return $q(function (resolve) {
                $timeout(resolve);
            });
        }

        /**
         * just some promise sugar
         * @param funcs - array of functions that return promises
         * @returns {promise}
         */
        function serial(funcs) {
            var promise = funcs.shift()();
            funcs.forEach(function (func) {
                promise = promise.then(func);
            });
            return promise;
        }

        /**
         * is there a next step
         *
         * @returns {boolean}
         */
        function isNext() {
            var current = self.getCurrentStep(),
                next = self.getNextStep();

            return !!(next || current.nextPath);
        }

        /**
         * is there a previous step
         *
         * @returns {boolean}
         */
        function isPrev() {
            var current = self.getCurrentStep(),
                prev = self.getPrevStep();

            return !!(prev || current.prevPath);
        }

        /**
         * Adds a step to the tour in order
         *
         * @param {object} step
         */
        self.addStep = function (step) {
            if (~stepList.indexOf(step)) {
                return;
            }
            stepList.push(step);
            stepList = $filter('orderBy')(stepList, 'order');
            if (resumeWhenFound) {
                resumeWhenFound(step);
            }
        };

        /**
         * Removes a step from the tour
         *
         * @param step
         */
        self.removeStep = function (step) {
            stepList.splice(stepList.indexOf(step), 1);
        };

        /**
         * if a step's order was changed, replace it in the list
         * @param step
         */
        self.reorderStep = function (step) {
            self.removeStep(step);
            self.addStep(step);
        };

        /**
         * starts the tour
         */
        self.start = function () {
            if (options.onStart) {
                options.onStart();
            }
            self.setCurrentStep(stepList[0]);
            tourStatus = statuses.ON;
            self.showStep(self.getCurrentStep());
        };

        /**
         * ends the tour
         */
        self.end = function () {
            if (self.getCurrentStep()) {
                self.hideStep(self.getCurrentStep());
            }
            if (options.onEnd) {
                options.onEnd();
            }
            self.setCurrentStep(null);
            tourStatus = statuses.OFF;
        };

        /**
         * pauses the tour
         */
        self.pause = function () {
            if (options.onPause) {
                options.onPause();
            }
            tourStatus = statuses.PAUSED;
            self.hideStep(self.getCurrentStep());
        };

        /**
         * resumes a paused tour or starts it
         */
        self.resume = function () {
            if (options.onResume) {
                options.onResume();
            }
            tourStatus = statuses.ON;
            self.showStep(self.getCurrentStep());
        };

        /**
         * move to next step
         * @returns {promise}
         */
        self.next = function () {
            var step = self.getCurrentStep();
            return serial([
                step.config('onNext') || $q.resolve,
                function () {
                    return self.hideStep(step);
                },
                function () {
                    //check if redirect happened, if not, set the next step
                    if (!step.nextStep || self.getCurrentStep().stepId !== step.nextStep) {
                        self.setCurrentStep(self.getNextStep());
                    }
                },
                function () {
                    if (self.getCurrentStep()) {
                        return self.showStep(self.getCurrentStep());
                    } else {
                        self.end();
                    }
                }
            ]);
        };

        /**
         * move to previous step
         * @returns {promise}
         */
        self.prev = function () {
            var step = self.getCurrentStep();
            return serial([
                step.config('onPrev') || $q.resolve,
                function () {
                    return self.hideStep(step);
                },
                function () {
                    //check if redirect happened, if not, set the prev step
                    if (!step.prevStep || self.getCurrentStep().stepId !== step.prevStep) {
                        self.setCurrentStep(self.getPrevStep());
                    }
                },
                function () {
                    if (self.getCurrentStep()) {
                        return self.showStep(self.getCurrentStep());
                    } else {
                        self.end();
                    }
                }
            ]);
        };

        /**
         * show supplied step
         * @param step
         * @returns {promise}
         */
        self.showStep = function (step) {
            return serial([
                step.config('onShow') || $q.resolve,
                function () {
                    if (step.config('backdrop')) {
                        uiTourBackdrop.createForElement(step.element, step.preventScrolling, step.fixed);
                    }
                    return $q.resolve();
                },
                function () {
                    return $q(function (resolve) {
                        step.element[0].dispatchEvent(new CustomEvent('uiTourShow'));
                        resolve();
                    });
                },
                digest,
                step.config('onShown') || $q.resolve,
                function () {
                    step.isNext = isNext();
                    step.isPrev = isPrev();
                    return $q.resolve();
                }
            ]);
        };

        /**
         * hides the supplied step
         * @param step
         * @returns {promise}
         */
        self.hideStep = function (step) {
            return serial([
                step.config('onHide') || $q.resolve,
                function () {
                    return $q(function (resolve) {
                        step.element[0].dispatchEvent(new CustomEvent('uiTourHide'));
                        resolve();
                    });
                },
                function () {
                    if (step.config('backdrop')) {
                        uiTourBackdrop.hide();
                    }
                    return $q.resolve();
                },
                digest,
                step.config('onHidden') || $q.resolve
            ]);
        };

        /**
         * return current step or null
         * @returns {step}
         */
        self.getCurrentStep = function () {
            return currentStep;
        };

        /**
         * set the current step (doesnt do anything else)
         */
        self.setCurrentStep = function (step) {
            currentStep = step;
        };

        /**
         * return next step or null
         * @returns {step}
         */
        self.getNextStep = function () {
            if (!self.getCurrentStep()) {
                return null;
            }
            return stepList[stepList.indexOf(self.getCurrentStep()) + 1];
        };

        /**
         * return previous step or null
         * @returns {step}
         */
        self.getPrevStep = function () {
            if (!self.getCurrentStep()) {
                return null;
            }
            return stepList[stepList.indexOf(self.getCurrentStep()) - 1];
        };

        /**
         * Tells the tour to pause while ngView loads
         *
         * @param waitForStep
         */
        self.waitFor = function (waitForStep) {
            self.pause();
            resumeWhenFound = function (step) {
                if (step.stepId === waitForStep) {
                    self.setCurrentStep(stepList[stepList.indexOf(step)]);
                    self.resume();
                    resumeWhenFound = null;
                }
            };
        };

        /**
         * Returns the value for specified option
         *
         * @param {string} option Name of option
         * @returns {*}
         */
        self.config = function (option) {
            return options[option];
        };

        /**
         * pass options from directive
         * @param opts
         * @returns {self}
         */
        self.init = function (opts) {
            options = angular.extend(options, opts);
            self.options = options;
            return self;
        };

        //some debugging functions
        self._getSteps = function () {
            return stepList;
        };
        self._getStatus = function () {
            return tourStatus;
        };
    }]);

}(angular.module('bm.uiTour')));