/**
 * Built-in food database — Indian home food, street food, and staples.
 *
 * Values are per ONE listed serving, approximated from IFCT 2017 / USDA
 * reference values for typical home recipes. They are estimates meant for
 * day-to-day tracking, not clinical dietetics.
 *
 * Row format:
 *   [id, name, aliases, serving label, grams per serving,
 *    kcal, protein g, carbs g, fat g, fibre g, category, diet]
 * diet: 'v' = vegetarian, 'e' = contains egg, 'n' = non-vegetarian
 */
const ROWS = [
  // ── Breads & grains ─────────────────────────────────────────────
  ['roti', 'Roti / Chapati', 'chapati chapatti phulka fulka rotli', '1 roti', 40, 104, 3, 18, 2.5, 2.7, 'Grains', 'v'],
  ['paratha', 'Plain Paratha', 'parantha parotta', '1 paratha', 60, 200, 4, 26, 9, 3, 'Grains', 'v'],
  ['aloo-paratha', 'Aloo Paratha', 'potato paratha', '1 paratha', 100, 290, 6, 40, 12, 4, 'Grains', 'v'],
  ['naan', 'Naan', 'nan', '1 naan', 90, 260, 8, 45, 5, 2, 'Grains', 'v'],
  ['butter-naan', 'Butter Naan', 'butter nan', '1 naan', 95, 310, 8, 45, 11, 2, 'Grains', 'v'],
  ['puri', 'Puri', 'poori', '1 puri', 25, 100, 1.5, 11, 6, 0.6, 'Grains', 'v'],
  ['rice', 'Steamed Rice', 'white rice chawal plain rice', '1 bowl', 150, 195, 4, 42, 0.4, 0.6, 'Grains', 'v'],
  ['brown-rice', 'Brown Rice', '', '1 bowl', 150, 165, 3.8, 34, 1.4, 2.7, 'Grains', 'v'],
  ['jeera-rice', 'Jeera Rice', 'cumin rice', '1 bowl', 150, 240, 4.5, 44, 5, 1, 'Grains', 'v'],
  ['veg-pulao', 'Veg Pulao', 'pulav pilaf', '1 bowl', 200, 300, 6, 50, 8, 3, 'Grains', 'v'],
  ['veg-biryani', 'Veg Biryani', '', '1 plate', 250, 400, 9, 60, 13, 4, 'Grains', 'v'],
  ['chicken-biryani', 'Chicken Biryani', 'biriyani', '1 plate', 300, 500, 24, 58, 18, 3, 'Grains', 'n'],
  ['khichdi', 'Khichdi', 'khichri kichdi', '1 bowl', 200, 230, 8, 38, 5, 4, 'Grains', 'v'],
  ['curd-rice', 'Curd Rice', 'thayir sadam dahi chawal', '1 bowl', 200, 250, 7, 38, 7, 1, 'Grains', 'v'],
  ['lemon-rice', 'Lemon Rice', 'chitranna', '1 bowl', 180, 280, 5, 45, 9, 2, 'Grains', 'v'],
  ['bajra-roti', 'Bajra Roti', 'bajre ki roti pearl millet', '1 roti', 45, 115, 3, 21, 2, 3, 'Grains', 'v'],
  ['jowar-roti', 'Jowar Roti', 'jowar bhakri sorghum', '1 roti', 45, 110, 3, 22, 1, 3, 'Grains', 'v'],
  ['ragi-roti', 'Ragi Roti', 'nachni finger millet ragi dosa', '1 roti', 45, 120, 3, 22, 2, 3.5, 'Grains', 'v'],
  ['thepla', 'Methi Thepla', 'thepla', '1 thepla', 40, 120, 3, 16, 5, 2, 'Grains', 'v'],
  ['bread', 'White Bread', 'bread slice toast', '1 slice', 25, 67, 2.2, 12.6, 0.8, 0.6, 'Grains', 'v'],
  ['brown-bread', 'Brown Bread', 'whole wheat bread atta bread', '1 slice', 27, 70, 3, 12, 1, 1.8, 'Grains', 'v'],
  ['oats', 'Oats Porridge', 'oatmeal oats', '1 bowl (40g dry)', 40, 150, 5, 27, 2.5, 4, 'Grains', 'v'],
  ['dalia', 'Dalia', 'broken wheat porridge daliya', '1 bowl', 200, 180, 6, 34, 2, 5, 'Grains', 'v'],
  ['quinoa', 'Quinoa (cooked)', '', '1 bowl', 150, 180, 6.6, 32, 2.9, 4.2, 'Grains', 'v'],
  ['cornflakes', 'Cornflakes with Milk', 'cereal corn flakes', '1 bowl', 230, 220, 7, 40, 4, 1, 'Grains', 'v'],
  ['pasta', 'Pasta (cooked)', 'macaroni penne', '1 bowl', 200, 300, 10, 50, 7, 3, 'Grains', 'v'],
  ['instant-noodles', 'Instant Noodles', 'maggi noodles', '1 packet', 70, 350, 7, 50, 14, 2, 'Grains', 'v'],

  // ── Breakfast & South Indian ────────────────────────────────────
  ['poha', 'Poha', 'pohe aval flattened rice', '1 plate', 150, 250, 5, 42, 7, 2, 'Breakfast', 'v'],
  ['upma', 'Upma', 'uppittu rava upma', '1 plate', 180, 250, 6, 38, 8, 3, 'Breakfast', 'v'],
  ['idli', 'Idli', 'idly', '1 idli', 40, 58, 2, 12, 0.2, 0.5, 'Breakfast', 'v'],
  ['dosa', 'Plain Dosa', 'dosai dosa', '1 dosa', 80, 133, 3, 22, 3.7, 1, 'Breakfast', 'v'],
  ['masala-dosa', 'Masala Dosa', '', '1 dosa', 180, 380, 7, 52, 15, 4, 'Breakfast', 'v'],
  ['uttapam', 'Uttapam', 'uthappam', '1 uttapam', 120, 210, 6, 34, 5, 2, 'Breakfast', 'v'],
  ['medu-vada', 'Medu Vada', 'vada wada', '1 vada', 40, 135, 4, 13, 7.5, 2, 'Breakfast', 'v'],
  ['besan-chilla', 'Besan Chilla', 'cheela chila gram flour pancake', '1 chilla', 70, 160, 8, 18, 6, 3, 'Breakfast', 'v'],
  ['moong-chilla', 'Moong Dal Chilla', 'pesarattu moong cheela', '1 chilla', 80, 150, 9, 18, 4, 3, 'Breakfast', 'v'],
  ['dhokla', 'Dhokla', 'khaman', '2 pieces', 70, 110, 4.5, 16, 3, 1.5, 'Breakfast', 'v'],
  ['sambar', 'Sambar', 'sambhar', '1 bowl', 150, 130, 6, 18, 4, 4, 'Dal & Curry', 'v'],
  ['coconut-chutney', 'Coconut Chutney', 'chutney', '2 tbsp', 30, 70, 1, 3, 6, 1.5, 'Breakfast', 'v'],

  // ── Dal & curries ───────────────────────────────────────────────
  ['dal', 'Dal (Toor/Arhar)', 'daal dhal toor dal arhar dal yellow dal', '1 bowl', 150, 150, 9, 20, 4, 4, 'Dal & Curry', 'v'],
  ['dal-tadka', 'Dal Tadka', 'dal fry', '1 bowl', 150, 180, 9, 20, 7, 4, 'Dal & Curry', 'v'],
  ['dal-makhani', 'Dal Makhani', 'maa ki dal', '1 bowl', 150, 280, 10, 25, 15, 6, 'Dal & Curry', 'v'],
  ['moong-dal', 'Moong Dal', 'mung dal', '1 bowl', 150, 130, 9, 18, 2.5, 4, 'Dal & Curry', 'v'],
  ['rajma', 'Rajma', 'kidney beans rajma masala', '1 bowl', 150, 210, 10, 28, 6, 8, 'Dal & Curry', 'v'],
  ['chole', 'Chole', 'chana masala chickpea curry chhole', '1 bowl', 150, 240, 10, 30, 9, 8, 'Dal & Curry', 'v'],
  ['kadhi', 'Kadhi', 'kadi pakora kadhi', '1 bowl', 150, 160, 6, 12, 10, 1, 'Dal & Curry', 'v'],
  ['palak-paneer', 'Palak Paneer', 'saag paneer', '1 bowl', 150, 270, 13, 9, 20, 3, 'Dal & Curry', 'v'],
  ['paneer-butter-masala', 'Paneer Butter Masala', 'paneer makhani shahi paneer', '1 bowl', 150, 380, 14, 14, 30, 2, 'Dal & Curry', 'v'],
  ['matar-paneer', 'Matar Paneer', 'mutter paneer', '1 bowl', 150, 300, 13, 14, 21, 4, 'Dal & Curry', 'v'],
  ['aloo-gobi', 'Aloo Gobi', 'gobi aloo cauliflower', '1 bowl', 150, 160, 4, 18, 8, 4, 'Dal & Curry', 'v'],
  ['bhindi', 'Bhindi Masala', 'okra bhindi sabzi', '1 bowl', 150, 150, 3, 12, 10, 4, 'Dal & Curry', 'v'],
  ['baingan-bharta', 'Baingan Bharta', 'brinjal eggplant', '1 bowl', 150, 140, 3, 12, 9, 5, 'Dal & Curry', 'v'],
  ['mix-veg', 'Sabzi (mixed veg)', 'sabji mix veg mixed vegetable curry', '1 bowl', 150, 150, 4, 15, 8, 4, 'Dal & Curry', 'v'],
  ['aloo-sabzi', 'Aloo Sabzi', 'jeera aloo potato curry', '1 bowl', 150, 190, 3, 26, 8, 3, 'Dal & Curry', 'v'],
  ['soya-curry', 'Soya Chunks Curry', 'soya chunk nutrela', '1 bowl', 150, 200, 18, 15, 7, 6, 'Dal & Curry', 'v'],
  ['chicken-curry', 'Chicken Curry', 'murgh curry', '1 bowl', 150, 300, 25, 8, 19, 1, 'Dal & Curry', 'n'],
  ['butter-chicken', 'Butter Chicken', 'murgh makhani', '1 bowl', 150, 440, 28, 12, 31, 2, 'Dal & Curry', 'n'],
  ['egg-curry', 'Egg Curry', 'anda curry', '1 bowl (2 eggs)', 180, 260, 14, 10, 18, 2, 'Dal & Curry', 'e'],
  ['fish-curry', 'Fish Curry', 'machli curry', '1 bowl', 150, 250, 22, 8, 14, 1, 'Dal & Curry', 'n'],
  ['prawn-curry', 'Prawn Curry', 'jhinga shrimp', '1 bowl', 150, 230, 22, 8, 12, 1, 'Dal & Curry', 'n'],
  ['mutton-curry', 'Mutton Curry', 'goat curry lamb', '1 bowl', 150, 380, 26, 8, 27, 1, 'Dal & Curry', 'n'],
  ['keema', 'Keema', 'kheema mince', '1 bowl', 150, 330, 22, 10, 22, 2, 'Dal & Curry', 'n'],

  // ── Protein foods ───────────────────────────────────────────────
  ['egg', 'Egg (boiled)', 'anda boiled egg', '1 egg', 50, 78, 6.3, 0.6, 5.3, 0, 'Protein', 'e'],
  ['egg-white', 'Egg White', 'egg whites', '1 white', 33, 17, 3.6, 0.2, 0.1, 0, 'Protein', 'e'],
  ['omelette', 'Omelette (2 eggs)', 'omelet', '1 omelette', 120, 190, 13, 2, 15, 0.5, 'Protein', 'e'],
  ['egg-bhurji', 'Egg Bhurji (2 eggs)', 'scrambled eggs anda bhurji', '1 plate', 130, 220, 13, 4, 17, 1, 'Protein', 'e'],
  ['chicken-breast', 'Grilled Chicken Breast', 'chicken breast grilled chicken', '100 g', 100, 165, 31, 0, 3.6, 0, 'Protein', 'n'],
  ['chicken-tikka', 'Chicken Tikka', '', '6 pieces', 150, 250, 36, 5, 9, 1, 'Protein', 'n'],
  ['tandoori-chicken', 'Tandoori Chicken', '', '1 leg piece', 150, 260, 30, 4, 14, 0.5, 'Protein', 'n'],
  ['fish-fry', 'Fish Fry', 'fried fish', '1 piece', 100, 220, 20, 8, 12, 0.5, 'Protein', 'n'],
  ['paneer', 'Paneer', 'cottage cheese', '100 g', 100, 265, 18, 3.6, 20, 0, 'Protein', 'v'],
  ['paneer-tikka', 'Paneer Tikka', '', '6 pieces', 150, 330, 20, 8, 24, 2, 'Protein', 'v'],
  ['tofu', 'Tofu', 'soya paneer', '100 g', 100, 144, 17, 3, 9, 2, 'Protein', 'v'],
  ['soya-chunks', 'Soya Chunks (dry)', 'soya nuggets', '30 g', 30, 104, 15.6, 9.9, 0.2, 3.9, 'Protein', 'v'],
  ['whey', 'Whey Protein', 'protein shake protein powder whey scoop', '1 scoop', 30, 120, 24, 3, 1.5, 0, 'Protein', 'v'],
  ['sprouts', 'Sprouts', 'moong sprouts sprouted moong', '1 bowl', 100, 100, 7, 15, 1, 4, 'Protein', 'v'],
  ['hung-curd', 'Hung Curd / Greek Yogurt', 'greek yogurt hung curd', '100 g', 100, 100, 9, 5, 5, 0, 'Protein', 'v'],

  // ── Dairy & beverages ───────────────────────────────────────────
  ['milk', 'Milk (toned)', 'doodh milk', '1 glass', 250, 150, 8, 12, 7.5, 0, 'Dairy', 'v'],
  ['skim-milk', 'Skimmed Milk', 'skim milk double toned', '1 glass', 250, 85, 8.5, 12, 0.3, 0, 'Dairy', 'v'],
  ['curd', 'Curd / Dahi', 'dahi yogurt yoghurt', '1 bowl', 150, 90, 5, 7, 5, 0, 'Dairy', 'v'],
  ['raita', 'Raita', 'boondi raita cucumber raita', '1 bowl', 150, 110, 5, 9, 6, 1, 'Dairy', 'v'],
  ['chaas', 'Buttermilk / Chaas', 'chaach mattha buttermilk', '1 glass', 250, 40, 2.5, 4, 1.5, 0, 'Dairy', 'v'],
  ['lassi', 'Sweet Lassi', 'lassi', '1 glass', 250, 220, 7, 34, 6, 0, 'Dairy', 'v'],
  ['chai', 'Chai (milk + sugar)', 'tea chai masala chai', '1 cup', 150, 90, 2.5, 12, 3, 0, 'Beverages', 'v'],
  ['coffee', 'Coffee (milk + sugar)', 'filter coffee cappuccino latte', '1 cup', 150, 90, 3, 12, 3.5, 0, 'Beverages', 'v'],
  ['black-coffee', 'Black Coffee', 'americano espresso', '1 cup', 150, 2, 0.3, 0, 0, 0, 'Beverages', 'v'],
  ['green-tea', 'Green Tea', 'black tea lemon tea', '1 cup', 200, 2, 0, 0.5, 0, 0, 'Beverages', 'v'],
  ['coconut-water', 'Coconut Water', 'nariyal pani tender coconut', '1 glass', 240, 46, 1.7, 9, 0.5, 2.6, 'Beverages', 'v'],
  ['orange-juice', 'Orange Juice (fresh)', 'juice mosambi juice', '1 glass', 250, 112, 1.7, 26, 0.5, 0.5, 'Beverages', 'v'],
  ['sugarcane-juice', 'Sugarcane Juice', 'ganne ka ras', '1 glass', 250, 180, 0, 45, 0, 0, 'Beverages', 'v'],
  ['nimbu-pani', 'Nimbu Pani (sweet)', 'lemonade shikanji lemon water', '1 glass', 250, 60, 0, 15, 0, 0, 'Beverages', 'v'],
  ['cola', 'Cola / Soft Drink', 'coke pepsi soda soft drink', '1 can', 330, 140, 0, 35, 0, 0, 'Beverages', 'v'],
  ['banana-shake', 'Banana Shake', 'milkshake smoothie', '1 glass', 300, 240, 8, 40, 6, 3, 'Beverages', 'v'],
  ['beer', 'Beer', '', '1 bottle', 330, 150, 1.6, 13, 0, 0, 'Beverages', 'v'],

  // ── Fats & add-ons ──────────────────────────────────────────────
  ['ghee', 'Ghee', 'desi ghee clarified butter', '1 tsp', 5, 45, 0, 0, 5, 0, 'Add-ons', 'v'],
  ['butter', 'Butter', 'makhan', '1 tsp', 5, 36, 0, 0, 4, 0, 'Add-ons', 'v'],
  ['oil', 'Cooking Oil', 'oil tel', '1 tsp', 5, 45, 0, 0, 5, 0, 'Add-ons', 'v'],
  ['cheese-slice', 'Cheese Slice', 'cheese', '1 slice', 17, 60, 4, 1, 4.5, 0, 'Add-ons', 'v'],
  ['peanut-butter', 'Peanut Butter', '', '1 tbsp', 16, 95, 4, 3, 8, 1, 'Add-ons', 'v'],
  ['sugar', 'Sugar', 'cheeni shakkar', '1 tsp', 4, 16, 0, 4, 0, 0, 'Add-ons', 'v'],
  ['honey', 'Honey', 'shahad', '1 tsp', 7, 21, 0, 5.7, 0, 0, 'Add-ons', 'v'],
  ['jaggery', 'Jaggery', 'gud gur', '10 g', 10, 38, 0, 9.8, 0, 0, 'Add-ons', 'v'],
  ['pickle', 'Pickle', 'achar achaar', '1 tbsp', 15, 40, 0.3, 2, 3.5, 0.5, 'Add-ons', 'v'],
  ['papad', 'Papad (roasted)', 'papadum', '1 papad', 12, 40, 3, 6, 0.4, 1, 'Add-ons', 'v'],

  // ── Fruits ──────────────────────────────────────────────────────
  ['banana', 'Banana', 'kela', '1 medium', 118, 105, 1.3, 27, 0.4, 3.1, 'Fruits', 'v'],
  ['apple', 'Apple', 'seb', '1 medium', 180, 95, 0.5, 25, 0.3, 4.4, 'Fruits', 'v'],
  ['orange', 'Orange', 'santra mosambi', '1 medium', 130, 62, 1.2, 15.4, 0.2, 3.1, 'Fruits', 'v'],
  ['mango', 'Mango', 'aam', '1 cup', 165, 99, 1.4, 25, 0.6, 2.6, 'Fruits', 'v'],
  ['papaya', 'Papaya', 'papita', '1 cup', 145, 62, 0.7, 16, 0.4, 2.5, 'Fruits', 'v'],
  ['watermelon', 'Watermelon', 'tarbooz', '1 cup', 152, 46, 0.9, 11.5, 0.2, 0.6, 'Fruits', 'v'],
  ['grapes', 'Grapes', 'angoor', '1 cup', 150, 104, 1.1, 27, 0.2, 1.4, 'Fruits', 'v'],
  ['guava', 'Guava', 'amrood peru', '1 medium', 55, 37, 1.4, 8, 0.5, 3, 'Fruits', 'v'],
  ['pomegranate', 'Pomegranate', 'anar', '1 cup', 174, 144, 2.9, 32, 2, 7, 'Fruits', 'v'],
  ['chikoo', 'Chikoo', 'sapota chiku', '1 medium', 100, 83, 0.4, 20, 1.1, 5.3, 'Fruits', 'v'],
  ['pineapple', 'Pineapple', 'ananas', '1 cup', 165, 82, 0.9, 22, 0.2, 2.3, 'Fruits', 'v'],
  ['pear', 'Pear', 'nashpati', '1 medium', 178, 101, 0.6, 27, 0.2, 5.5, 'Fruits', 'v'],
  ['dates', 'Dates', 'khajur khajoor', '1 date', 8, 23, 0.2, 6, 0, 0.6, 'Fruits', 'v'],

  // ── Nuts & healthy snacks ───────────────────────────────────────
  ['almonds', 'Almonds', 'badam', '10 almonds', 12, 70, 2.6, 2.5, 6, 1.5, 'Snacks', 'v'],
  ['walnuts', 'Walnuts', 'akhrot', '4 walnuts', 15, 98, 2.3, 2, 9.8, 1, 'Snacks', 'v'],
  ['cashews', 'Cashews', 'kaju', '10 cashews', 15, 90, 3, 5, 7, 0.5, 'Snacks', 'v'],
  ['peanuts', 'Peanuts', 'moongphali groundnut', '30 g', 30, 170, 7.7, 4.8, 14.8, 2.6, 'Snacks', 'v'],
  ['roasted-chana', 'Roasted Chana', 'bhuna chana chickpeas', '30 g', 30, 110, 6.5, 18, 1.6, 5, 'Snacks', 'v'],
  ['makhana', 'Makhana', 'fox nuts lotus seeds phool makhana', '1 cup', 30, 105, 3, 23, 0.3, 4, 'Snacks', 'v'],
  ['salad', 'Green Salad', 'salad cucumber kheera tomato onion salad', '1 bowl', 150, 35, 1.5, 7, 0.2, 2, 'Snacks', 'v'],
  ['veg-soup', 'Vegetable Soup', 'clear soup soup', '1 bowl', 250, 70, 2, 12, 1.5, 2.5, 'Snacks', 'v'],
  ['tomato-soup', 'Tomato Soup', '', '1 bowl', 250, 90, 2, 14, 3, 2, 'Snacks', 'v'],
  ['marie-biscuit', 'Marie Biscuit', 'biscuit biscuits glucose biscuit', '1 biscuit', 6, 26, 0.4, 4.2, 0.8, 0.1, 'Snacks', 'v'],
  ['dark-chocolate', 'Dark Chocolate', 'chocolate', '20 g', 20, 120, 1.6, 9, 8.5, 2.2, 'Snacks', 'v'],

  // ── Street food & eating out ────────────────────────────────────
  ['samosa', 'Samosa', 'samosa', '1 samosa', 80, 260, 4, 30, 14, 2.5, 'Street Food', 'v'],
  ['kachori', 'Kachori', '', '1 kachori', 60, 190, 4, 20, 11, 2, 'Street Food', 'v'],
  ['pakora', 'Pakora', 'pakoda bhajji bhaji onion bhaji', '4 pieces', 80, 200, 4, 18, 13, 2, 'Street Food', 'v'],
  ['pav-bhaji', 'Pav Bhaji', '', '1 plate (2 pav)', 300, 450, 11, 60, 19, 7, 'Street Food', 'v'],
  ['vada-pav', 'Vada Pav', 'wada pav', '1 vada pav', 140, 290, 6, 40, 12, 3, 'Street Food', 'v'],
  ['pani-puri', 'Pani Puri', 'golgappa puchka gol gappe', '6 pieces', 120, 200, 4, 30, 7, 3, 'Street Food', 'v'],
  ['bhel-puri', 'Bhel Puri', 'bhel', '1 plate', 150, 250, 6, 40, 8, 4, 'Street Food', 'v'],
  ['aloo-tikki', 'Aloo Tikki', 'tikki', '1 tikki', 70, 150, 2.5, 20, 7, 2, 'Street Food', 'v'],
  ['veg-momos', 'Veg Momos (steamed)', 'momo momos dumplings', '6 pieces', 180, 240, 7, 40, 5, 3, 'Street Food', 'v'],
  ['chicken-momos', 'Chicken Momos (steamed)', 'chicken momo', '6 pieces', 180, 280, 15, 34, 8, 2, 'Street Food', 'n'],
  ['namkeen', 'Namkeen / Bhujia', 'bhujia mixture chivda', '30 g', 30, 160, 4, 13, 10, 2, 'Street Food', 'v'],
  ['chips', 'Potato Chips', 'wafers crisps', '30 g', 30, 160, 2, 15, 10, 1.3, 'Street Food', 'v'],
  ['veg-sandwich', 'Veg Sandwich', 'sandwich', '1 sandwich', 150, 250, 7, 34, 9, 3, 'Street Food', 'v'],
  ['cheese-sandwich', 'Grilled Cheese Sandwich', 'cheese toast', '1 sandwich', 150, 330, 13, 32, 16, 2, 'Street Food', 'v'],
  ['pizza', 'Pizza', 'pizza slice', '1 slice', 107, 285, 12, 36, 10, 2.5, 'Street Food', 'v'],
  ['veg-burger', 'Veg Burger', 'burger', '1 burger', 170, 350, 9, 45, 15, 3, 'Street Food', 'v'],
  ['fries', 'French Fries', 'fries finger chips', '1 medium', 117, 365, 4, 48, 17, 4.4, 'Street Food', 'v'],
  ['chowmein', 'Veg Chowmein', 'hakka noodles chow mein noodles', '1 plate', 250, 400, 9, 55, 16, 3, 'Street Food', 'v'],
  ['fried-rice', 'Veg Fried Rice', 'fried rice', '1 plate', 250, 380, 8, 58, 13, 2, 'Street Food', 'v'],
  ['shawarma', 'Chicken Shawarma', 'shawarma wrap', '1 roll', 250, 450, 25, 45, 18, 3, 'Street Food', 'n'],
  ['kathi-roll', 'Chicken Kathi Roll', 'kati roll frankie', '1 roll', 220, 420, 22, 45, 16, 3, 'Street Food', 'n'],

  // ── Sweets ──────────────────────────────────────────────────────
  ['gulab-jamun', 'Gulab Jamun', '', '1 piece', 50, 150, 2, 22, 6, 0.3, 'Sweets', 'v'],
  ['rasgulla', 'Rasgulla', 'rosogolla', '1 piece', 50, 125, 3, 25, 1.5, 0, 'Sweets', 'v'],
  ['jalebi', 'Jalebi', '', '2 pieces', 50, 200, 1.5, 30, 8.5, 0.2, 'Sweets', 'v'],
  ['kheer', 'Kheer', 'payasam rice pudding', '1 bowl', 150, 260, 7, 38, 8, 0.5, 'Sweets', 'v'],
  ['suji-halwa', 'Suji Halwa', 'sheera halwa', '1 bowl', 100, 330, 4, 45, 15, 1, 'Sweets', 'v'],
  ['besan-ladoo', 'Besan Ladoo', 'laddu ladoo', '1 ladoo', 40, 185, 3.5, 20, 10, 1, 'Sweets', 'v'],
  ['barfi', 'Barfi', 'burfi kaju katli', '1 piece', 30, 140, 3, 18, 6, 0.3, 'Sweets', 'v'],
  ['ice-cream', 'Ice Cream', 'icecream kulfi', '1 scoop', 66, 137, 2.3, 16, 7, 0.5, 'Sweets', 'v'],
];

export const FOODS = ROWS.map(([id, name, aliases, serving, g, kcal, p, c, f, fib, cat, diet]) => ({
  id, name, aliases, serving, g, kcal, p, c, f, fib, cat, diet,
}));

export const FOOD_BY_ID = Object.fromEntries(FOODS.map((f) => [f.id, f]));

export const CATEGORIES = [...new Set(FOODS.map((f) => f.cat))];

export function getFood(id, customFoods = []) {
  return FOOD_BY_ID[id] || customFoods.find((f) => f.id === id) || null;
}
