(function(window, $, undefined){

	/* constructor */
	function FormReplicator(element, options) {
		var self = this;

		self.$el = element;
		self.o = $.extend({}, self.defaults, options);

		self.counter = 0;

		/**
		 * Řádek, který budeme klonovat při přidání nového řádku.
		 */
		self.$row = $(self.o.template);

		if (self.o.addStaticButton instanceof $) {
			self.$addButton = self.o.addStaticButton;
		} else if (typeof self.o.addStaticButton === 'function') {
			self.$addButton = self.o.addStaticButton(self.$el);
		} else {
			self.$addButton = $();
		}

		self.updateButtonShow();

		self.$el.on('click', self.o.deleteSelection, function(e){
			self.removeRow(e, $(this));
		});

		self.$addButton.on('click', function(e){
			let newRowsNumber = 1;
			if (self.o.addStaticButtonNumberInputSelector) {
				newRowsNumber = parseInt($(self.o.addStaticButtonNumberInputSelector).val());
			}

			if (!newRowsNumber) {
				newRowsNumber = 1;
			}

			for (let i = 0; i < newRowsNumber; i++) {
				self.addRow(e);
			}
		});

		if (self.o.addSelection) {
			self.$el.on('click', self.o.addSelection, function(e){
				self.addRow(e, $(this));
			});
		}

		if (self.o.sensitiveSelection) {
			self.$el.on('change keyup', self.o.sensitiveSelection, function(e){

				// existuje již prázdný řádek?
				var empty = true;
				self.$el.children().last().find(self.o.sensitiveSelection).each(function(){
					if ($(this).val() != '') {
						empty = false;
						return false;
					}
				});
				if (empty) return;

				self.addRow(e);
			});
		}

	}

	/* core prototype */
	FormReplicator.prototype = {

		updateButtonShow: function() {
			var self = this;

			var $add = self.$el.find(self.o.addSelection);

			var $delete = self.$el.find(self.o.deleteSelection);

			if (self.o.sensitiveSelection) {
				self.$addButton.addClass(self.o.classHidden);
				$add.addClass(self.o.classHidden);

				$delete.removeClass(self.o.classHidden);
				$delete.last().addClass(self.o.classHidden);

			} else {

				if (!self.o.addButtonShowAlways) {
					$add.addClass(self.o.classHidden);
					$add.last().removeClass(self.o.classHidden);
				}

				if (!self.o.addStaticButtonShowAlways) {
					if (self.$el.children().length !== 0) {
						self.$addButton.addClass(self.o.classHidden);
					} else {
						self.$addButton.removeClass(self.o.classHidden);
					}
				}

				if (self.$el.children().length <= self.o.minRequired) {
					$delete.addClass(self.o.classHidden);
				} else {
					$delete.removeClass(self.o.classHidden);
				}
			}
		},

		addRow: function(e, $button) {

			var self = this;

			if ($button) {
				var $row = $button.closest(self.$el.children());
			}

			if (self.o.beforeClone) {
				self.o.beforeClone.call(self, e, self.$row);
			}

			var $newRow = self.$row.clone();
			var newRowCounter = self.counter;

			$newRow.find(':input').each(function(){
				var $input = $(this);

				var rules = JSON.parse($input[0].getAttribute('data-nette-rules'));
				for (var i in rules) {
					var rule = rules[i];
					if (rule.toggle !== undefined) {
						for (var toggleId in rule.toggle) {
							self.replaceElemAttr($newRow.find('[id='+ toggleId +']'), 'id', self.counter);
						}
					}
				}

				$.each([
					'id', 'name'
				], function(){
					self.replaceElemAttr($input, this, self.counter);
				});

				var attrRules = $input.attr('data-nette-rules');
				if (attrRules) {
					// TODO: správně by to mělo být `/"(?>\\.|.)*?"/g`, ale atomic group nejsou ve Firefoxu podporované.
					// TODO: S aktuální implementací, pokud bude v nějakém rule JSON (třeba v hlášce) vyescapovaná uvozovka
					// TODO: bez svého protějšku, například "Máte špatně uvozovku \", opravte si to.", tak se rules nemusí
					// TODO: bindovat na správné inputy.
					attrRules.match(/"[^"]*"/g).forEach(function(string) {
						var search = string.substring(1, string.length - 1);
						var replace = self.replaceAttr(search, self.counter);
						attrRules = attrRules.replace(search, replace);
					});
					$input.attr('data-nette-rules', attrRules);
				}
			});
			$newRow.find('label').each(function(){
				self.replaceElemAttr($(this), 'for', self.counter);
			});

			self.counter++;

			if ($row && self.o.addButtonAddAfter) {
				$row.after($newRow);
			} else {
				self.$el.append($newRow);
			}

			if (self.o.orderSelector) {
				let counter = 1;
				$(self.o.orderSelector).each(function () {
					$(this).val(counter++);
				});
			}

			self.updateButtonShow();

			if (self.o.afterClone) {
				self.o.afterClone.call(self, e, $newRow, self.$row, newRowCounter);
			}

			// Musí být až po afterClone, aby se inicializoval případný datepicker dřív, než se bude kvůli Vodacek validátoru přistupovat k jeho hodnotě.
			self.toggleFormPart($newRow.find(':input'));

			return $newRow;
		},

		replaceElemAttr: function($el, attrName, counter) {
			var self = this;

			var attrVal = $el.attr(attrName);
			if (attrVal === undefined) return;

			$el.attr(attrName, attrVal.replace(this.o.idPrefix, this.o.idPrefix + counter));
		},

		replaceAttr: function(string, counter) {
			var self = this;

			var regexp = new RegExp('(\\[)'+ this.o.idPrefix + '(\\])|(-)'+ this.o.idPrefix + '(-)', 'g');

			var stringMatch = string.match(regexp);
			if (stringMatch === null) return string;	// nejedná se o string reprezentující název komponenty

			var matchCount = stringMatch.length;
			var matchIndex = 0;
			return string.replace(regexp, function(match, l1, r1, l2, r2, pos, original){
				var out = match;
				var l = l1 || l2;
				var r = r1 || r2;
				if (matchIndex === self.o.depth) {	// particular occurance
					//if (matchIndex === 0) {	// first occurance
					//if (matchIndex === matchCount-1) {	// last occurance
					out = l + self.o.idPrefix + counter + r;
				}

				matchIndex++;

				return out;
			});
		},

		removeRow: function(e, $button) {
			var self = this;

			var $row = $button.closest(self.$el.children());

			if(self.o.beforeDelete && self.o.beforeDelete.call(self, e, $row) === false) {
				return;
			}

			$row.detach();

			self.updateButtonShow();

			if(self.o.afterDelete) {
				self.o.afterDelete.call(self, e, $row);
			}
		},

		/**
		 * Process toggles in form on entered inputs.
		 */
		toggleFormPart: function($inputs) {
			if (!Nette) return;

			$inputs.each(function(){
				var el = this;
				if (el.tagName.toLowerCase() in { input: 1, select: 1, textarea: 1, button: 1 }) {
					Nette.toggleControl(el, null, null, true);
				}
			});

			var i;
			for (i in Nette.toggles) {
				Nette.toggle(i, Nette.toggles[i]);
			}
		},

		/* default option */
		defaults: {

			/**
			 * Selection pro tlačítka delete v položkách.
			 * string
			 */
			deleteSelection: null,

			/**
			 * Selection pro tlačítka add v položkách.
			 * string
			 */
			addSelection: null,

			/**
			 * Tlačítka add v položkách zobrazit stále všechna.
			 * bool
			 */
			addButtonShowAlways: false,

			/**
			 * Zda tlačítkem v položkách přidávat řádky za řádek, kde se kliklo.
			 * V DB si pohlídat pořadí ručně. Lze použít "orderSelector"
			 * bool
			 */
			addButtonAddAfter: false,

			/**
			 * Selektor určující input, ve kterém se uržuje aktuální pořadí, počítáno od 1.
			 * string
			 */
			orderSelector: false,

			/**
			 * Tlačítko add mimo položky.
			 * jQuery
			 */
			addStaticButton: null,

			/**
			 * Tlačítko add mimo položky zobrazovat vždy.
			 * bool
			 */
			addStaticButtonShowAlways: false,

			/**
			 * Selektor na inputu, určujícím, kolik chci přidat novách řádků
			 * string
			 */
			addStaticButtonNumberInputSelector: false,

			/**
			 * string
			 */
			sensitiveSelection: null,

			/**
			 * Třída, která se použije pro skrývání elementů.
			 */
			classHidden: 'hidden',

			/**
			 * Prefix před id, který se vyskytuje u nových položek.
			 */
			idPrefix: '_new_',

			/**
			 * Počet položek, při kterém se schovají všechna delete tlačítka.
			 */
			minRequired: 0,

			/**
			 * Pokud je replikátor v replikátoru, hloubka udává zanoření tohoto (počítáno od 0).
			 */
			depth: 0,

			/**
			 * function (e, $oldRow)
			 */
			beforeClone: null,

			/**
			 * function (e, $input, $newRow)
			 * Pokud vrátí false, defaultní mazání hodnot nebude provedeno.
			 */
			inputClear: null,

			/**
			 * function (e, $newRow, $oldRow, newRowCounter)
			 * newRowCounter ... jaké číslo bylo použito pro tvorbu názvu $newRow.
			 */
			afterClone: null,

			/**
			 * function (e, $row)
			 * Vrácením false lze zrušit smazání položky.
			 */
			beforeDelete: null,

			/**
			 * function (e, $row)
			 */
			afterDelete: null,

			/**
			 * string s html kodem, ktery se ma replikovat
			 */
			template: null
		}
	};

	$.fn.formReplicator = function(options) {
		return this.each(function(){
			var self = $(this);

			if( !self.data('formReplicator') ) {
				self.data('formReplicator', new FormReplicator(self, options));
			}
		});
	};

})(window, jQuery);
