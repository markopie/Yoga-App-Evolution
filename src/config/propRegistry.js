export const PROP_REGISTRY = {
    bandage: {
        id: 'bandage',
        label: 'Therapeutic Bandage',
        icon: '🩹',
        color: '#d35400',
        audioCue: 'Wearing a bandage.',
        bannerTitle: 'Therapeutic Protocol: Head Bandage',
        bannerHtml: `A firmly tied bandage round the head is soothing for headaches. Wind bandage around the forehead and back of the skull. Pull firmly but not tight.
<br><small><em>Eyestrain: cover eyes lightly 2-3 times at start.</em></small>`
    },
    block: {
        id: 'block',
        label: 'Block',
        icon: '🧱',
        color: '#ff0080',
        audioCue: 'Use a block for hand support.',
        bannerTitle: 'Therapeutic Protocol: Block Support',
        bannerHtml: `Core Instruction: Perform these asanas using a block for hand support rather than resting on the floor.<br>
Adjustment: Utilize varying block heights to maintain spinal alignment.<br>
<small><em>Benefit: This protocol focuses on freeing and stretching affected areas to improve mobility through controlled support.</em></small>`
    },
    blanket: {
        id: 'blanket',
        label: 'Blanket',
        icon: '🧶',
        color: '#2ecc71',
        audioCue: 'Use a folded blanket for support.',
        bannerTitle: 'Therapeutic Protocol: Blanket Support',
        bannerHtml: 'Use a folded blanket to support the neck, hips, or knees as required. Maintain even thickness to ensure level alignment.'
    },
    chair: {
        id: 'chair',
        label: 'Chair',
        icon: '🪑',
        color: '#9b59b6',
        audioCue: 'Using a chair for support.',
        bannerTitle: 'Therapeutic Protocol: Chair Support',
        bannerHtml: 'Perform the asana using a stable chair for balance or to reduce weight-bearing load on the joints.'
    },
    pole_or_stick: {
        id: 'pole_or_stick',
        label: 'Pole or Stick',
        icon: '🦯',
        color: '#7f8c8d',
        audioCue: 'Use a pole or stick for alignment.',
        bannerTitle: 'Therapeutic Protocol: Alignment Tool',
        bannerHtml: 'Hold a pole or stick to help maintain arm alignment and chest opening.'
    },
    ledge: {
        id: 'ledge',
        label: 'Ledge / Wall Ledge',
        icon: '🪜',
        color: '#e67e22',
        audioCue: 'Support your hands or feet on a ledge.',
        bannerTitle: 'Therapeutic Protocol: Ledge Support',
        bannerHtml: 'Utilize a window ledge or wall protrusion to provide stable height for hand or foot placement.'
    }
};

// Expose to window for zero-import modules like posePlayer and audioEngine
if (typeof window !== 'undefined') {
    window.PROP_REGISTRY = PROP_REGISTRY;
}